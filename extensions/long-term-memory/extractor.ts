// Memory extraction: spawn a one-shot pi sub-process to pull durable facts out
// of a conversation. Best-effort — on any failure it returns [].

import { spawn } from "node:child_process";

const EXTRACT_TIMEOUT_MS = Number(process.env.MEMORY_EXTRACT_TIMEOUT_MS ?? "60000") || 60000;

const EXTRACT_PROMPT =
  "From the conversation below, extract durable facts worth remembering long-term " +
  "(user preferences, decisions, project conventions). Output one fact per line, plain text, " +
  "no numbering or commentary. If nothing is worth saving, output nothing.\n\nConversation:\n";

interface PiEvent {
  role?: string;
  text?: string;
  content?: unknown;
  message?: { role?: string; content?: unknown };
}

export function resolvePiCommand(): string {
  // PI_BIN explicitly overrides; otherwise reuse the current executable (the
  // sidecar binary itself under bun --compile) so desktop needs no global `pi`.
  return process.env.PI_BIN ?? process.execPath;
}

export function parseExtracted(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 3 && l.length < 300);
}

function extractAssistantText(jsonl: string): string {
  const lines = jsonl.split(/\r?\n/).filter((l) => l.trim());
  let text = "";
  for (const line of lines) {
    let ev: PiEvent | null = null;
    try {
      ev = JSON.parse(line) as PiEvent;
    } catch {
      continue;
    }
    const role = ev.message?.role ?? ev.role;
    if (role !== "assistant") continue;
    const content = ev.message?.content ?? ev.content ?? ev.text;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const t = content
        .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
        .map((p) => p.text)
        .join("");
      if (t) text = t;
    }
  }
  return text || jsonl;
}

export async function extractMemories(
  cwd: string,
  conversation: string,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<string[]> {
  const cmd = resolvePiCommand();
  const args = ["--mode", "json", "-p", "--no-session"];
  if (opts.model) args.push("--model", opts.model);
  args.push(EXTRACT_PROMPT + conversation);

  const output = await new Promise<string>((resolve) => {
    let settled = false;
    const done = (s: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(s);
    };
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      done(stdout);
    }, EXTRACT_TIMEOUT_MS);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    opts.signal?.addEventListener("abort", () => { child.kill(); done(stdout); }, { once: true });
    child.on("error", () => done(""));
    child.on("close", () => done(stdout));
  });

  return parseExtracted(extractAssistantText(output));
}
