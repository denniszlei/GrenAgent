// git shadow-repo snapshots: a separate --git-dir tracking the workspace
// (--work-tree=cwd) so we never touch the user's .git. Mirrors opencode's snapshot.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FLAGS = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.longpaths=true",
  "-c",
  "core.quotepath=false",
  "-c",
  "core.symlinks=true",
];
const SNAP_REF = "refs/heads/snapshots";
const MAX_BYTES = 2 * 1024 * 1024;

export interface FileChange {
  file: string;
  status: string;
}

/** Build git argv: windows-safe flags + git-dir + work-tree + cmd. Pure (testable). */
export function gitArgs(gitdir: string, cwd: string, cmd: string[]): string[] {
  return [...FLAGS, "--git-dir", gitdir, "--work-tree", cwd, ...cmd];
}

/** Parse `git diff --name-status` output. Pure (testable). */
export function parseNameStatus(out: string): FileChange[] {
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab < 0) return { file: "", status: "" };
      return { status: line.slice(0, tab).trim()[0] ?? "M", file: line.slice(tab + 1).trim() };
    })
    .filter((c) => c.file);
}

function run(
  gitdir: string,
  cwd: string,
  cmd: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", gitArgs(gitdir, cwd, cmd), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function ensureRepo(gitdir: string, cwd: string): Promise<void> {
  if (existsSync(join(gitdir, "HEAD"))) return;
  mkdirSync(gitdir, { recursive: true });
  await run(gitdir, cwd, ["init", "-q"]);
  await run(gitdir, cwd, ["config", "core.bare", "false"]);
  await run(gitdir, cwd, ["config", "user.email", "checkpoint@grenagent.local"]);
  await run(gitdir, cwd, ["config", "user.name", "GrenAgent Checkpoint"]);
  mkdirSync(join(gitdir, "info"), { recursive: true });
  // Never snapshot the shadow store or the user's git metadata.
  writeFileSync(join(gitdir, "info", "exclude"), "/.pi/\n/.git/\n");
}

export async function track(gitdir: string, cwd: string): Promise<{ hash: string; files: FileChange[] } | null> {
  await run(gitdir, cwd, ["add", "-A", "--", "."]); // respects work-tree .gitignore + info/exclude
  // Drop oversized files from the snapshot index.
  const staged = (await run(gitdir, cwd, ["diff", "--cached", "--name-only"])).stdout.split(/\r?\n/).filter(Boolean);
  for (const f of staged) {
    try {
      if (statSync(join(cwd, f)).size > MAX_BYTES) await run(gitdir, cwd, ["rm", "--cached", "-q", "--", f]);
    } catch {
      /* file vanished; ignore */
    }
  }
  const tree = (await run(gitdir, cwd, ["write-tree"])).stdout.trim();
  if (!tree) return null;
  const parent = (await run(gitdir, cwd, ["rev-parse", "--verify", "-q", SNAP_REF])).stdout.trim();
  if (parent) {
    const parentTree = (await run(gitdir, cwd, ["rev-parse", `${parent}^{tree}`])).stdout.trim();
    if (parentTree === tree) return null; // nothing changed
  }
  const commitCmd = ["commit-tree", tree, "-m", "checkpoint"];
  if (parent) commitCmd.push("-p", parent);
  const hash = (await run(gitdir, cwd, commitCmd)).stdout.trim();
  if (!hash) return null;
  await run(gitdir, cwd, ["update-ref", SNAP_REF, hash]);
  const files = parent
    ? parseNameStatus((await run(gitdir, cwd, ["diff", "--name-status", parent, hash])).stdout)
    : parseNameStatus((await run(gitdir, cwd, ["show", "--name-status", "--format=", hash])).stdout);
  return { hash, files };
}

export async function diff(gitdir: string, cwd: string, hash: string): Promise<string> {
  return (await run(gitdir, cwd, ["diff", hash, "--", "."])).stdout;
}

export async function restore(gitdir: string, cwd: string, hash: string): Promise<void> {
  const latest = (await run(gitdir, cwd, ["rev-parse", "--verify", "-q", SNAP_REF])).stdout.trim();
  // Files the checkpoint system added after `hash` → delete them so the revert is complete.
  let added: string[] = [];
  if (latest && latest !== hash) {
    added = parseNameStatus(
      (await run(gitdir, cwd, ["diff", "--name-status", "--diff-filter=A", hash, latest])).stdout,
    ).map((c) => c.file);
  }
  await run(gitdir, cwd, ["read-tree", hash]);
  await run(gitdir, cwd, ["checkout-index", "-a", "-f"]);
  for (const f of added) {
    try {
      rmSync(join(cwd, f), { force: true });
    } catch {
      /* ignore */
    }
  }
}
