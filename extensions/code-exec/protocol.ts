// 宿主 ↔ runner.py 的 NDJSON 行协议（纯逻辑，无 I/O，便于单测）。

export interface ExecResult {
  type: "result";
  id: string;
  stdout: string;
  stderr: string;
  value: string | null;
  ok: boolean;
  error: string | null;
}

export type KernelMessage =
  | ExecResult
  | { type: "pong"; id: string }
  | { type: string; id?: string; [k: string]: unknown };

export function encodeExec(id: string, code: string, timeoutMs?: number): string {
  return `${JSON.stringify({ type: "exec", id, code, timeoutMs })}\n`;
}

export function encodeReset(id: string): string {
  return `${JSON.stringify({ type: "reset", id })}\n`;
}

export function encodePing(id: string): string {
  return `${JSON.stringify({ type: "ping", id })}\n`;
}

// 增量行缓冲：push 原始 chunk，吐出已完整的行（按 \n 切，保留未完成的残段）。
export class LineBuffer {
  private buf = "";

  push(chunk: string): string[] {
    this.buf += chunk;
    const lines: string[] = [];
    let idx = this.buf.indexOf("\n");
    while (idx >= 0) {
      lines.push(this.buf.slice(0, idx));
      this.buf = this.buf.slice(idx + 1);
      idx = this.buf.indexOf("\n");
    }
    return lines;
  }
}

// 解析一行协议消息；非 JSON / 非协议行（如程序杂散 stdout）返回 null。
export function parseMessage(line: string): KernelMessage | null {
  const s = line.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s) as KernelMessage;
    if (obj && typeof obj === "object" && typeof (obj as { type?: unknown }).type === "string") {
      return obj;
    }
  } catch {
    /* not a protocol line */
  }
  return null;
}

// 单段输出上限，超出截断，避免大 DataFrame / 长循环输出灌爆上下文（spec D2）。
const MAX_OUTPUT = 64 * 1024;

function clip(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…（输出过长已截断，共 ${s.length} 字符）` : s;
}

// 把内核结果渲染成给模型看的文本：stdout / stderr / 值回显 / traceback（各段超长截断）。
export function formatResult(r: ExecResult): string {
  const parts: string[] = [];
  if (r.stdout) parts.push(clip(r.stdout.replace(/\n$/, "")));
  if (r.stderr) parts.push(clip(r.stderr.replace(/\n$/, "")));
  if (r.value !== null && r.value !== undefined) parts.push(`=> ${clip(r.value)}`);
  if (!r.ok && r.error) parts.push(clip(r.error.replace(/\n$/, "")));
  return parts.join("\n") || "(无输出)";
}
