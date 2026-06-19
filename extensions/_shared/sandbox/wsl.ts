import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { winToWslPath } from "./paths.js";
import { buildSrtSettings } from "./srt.js";
import type { SandboxAdapter, SandboxResult, SandboxSpec } from "./types.js";

export type RunFn = (file: string, args: string[], timeoutMs?: number) => Promise<SandboxResult>;

// 默认 run：spawn wsl.exe，收集 stdout/stderr/code，带超时 kill。
const defaultRun: RunFn = (file, args, timeoutMs) =>
  new Promise<SandboxResult>((resolve) => {
    const child = spawn(file, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = timeoutMs
      ? setTimeout(() => {
          try {
            child.kill();
          } catch {
            /* gone */
          }
          resolve({ stdout, stderr: `${stderr}\n[sandbox] timeout ${timeoutMs}ms`, code: -1 });
        }, timeoutMs)
      : undefined;
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr: String(e), code: -1 });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });

// 默认 writeSettings：把 srt settings 写到宿主 temp，再转成 WSL 路径返回。
async function defaultWriteSettings(spec: SandboxSpec, wslCwd: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "pi-sbx-"));
  const winPath = join(dir, "srt-settings.json");
  writeFileSync(winPath, JSON.stringify(buildSrtSettings(spec, wslCwd)), "utf8");
  return winToWslPath(winPath);
}

export interface WslSandboxOpts {
  distro: string;
  run?: RunFn;
  writeSettings?: (spec: SandboxSpec, wslCwd: string) => Promise<string>;
}

export class WslSandbox implements SandboxAdapter {
  private distro: string;
  private run: RunFn;
  private writeSettings: (spec: SandboxSpec, wslCwd: string) => Promise<string>;
  constructor(opts: WslSandboxOpts) {
    this.distro = opts.distro;
    this.run = opts.run ?? defaultRun;
    this.writeSettings = opts.writeSettings ?? defaultWriteSettings;
  }
  async isAvailable(): Promise<boolean> {
    // 由 getSandbox() 的探测决定是否构造本类；构造出来即视为可用。
    return true;
  }
  async exec(command: string, spec: SandboxSpec): Promise<SandboxResult> {
    const wslCwd = winToWslPath(spec.cwd);
    const settings = await this.writeSettings(spec, wslCwd);
    const args = [
      "-d",
      this.distro,
      "--cd",
      wslCwd,
      "--",
      "srt",
      "--settings",
      settings,
      "bash",
      "-lc",
      command,
    ];
    return this.run("wsl.exe", args, spec.timeoutMs);
  }
}
