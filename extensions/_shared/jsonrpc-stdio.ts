// Content-Length 帧 JSON-RPC over 子进程 stdio（LSP 与 DAP 共用）。
// 帧编解码是纯逻辑（便于单测）；JsonRpcConnection 把它接到子进程的 stdin/stdout。
import type { Writable } from "node:stream";

export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
  return Buffer.concat([header, body]);
}

// 增量帧解码：push 原始 chunk，吐出已完整的 JSON 消息（不完整则缓存等待后续）。
export class FrameDecoder {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    for (;;) {
      const headerEnd = this.buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buf.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buf = this.buf.subarray(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buf.length < start + len) break;
      const body = this.buf.subarray(start, start + len).toString("utf8");
      this.buf = this.buf.subarray(start + len);
      try {
        out.push(JSON.parse(body));
      } catch {
        /* skip malformed frame */
      }
    }
    return out;
  }
}

export interface RpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

type NotificationHandler = (params: unknown) => void;

// JSON-RPC 连接：request（带 id 等响应）、notify（无 id）、onNotification（订阅服务端通知）。
export class JsonRpcConnection {
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly decoder = new FrameDecoder();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();

  constructor(private readonly stdin: Writable) {}

  feed(chunk: Buffer): void {
    for (const msg of this.decoder.push(chunk)) this.dispatch(msg as RpcMessage);
  }

  request(method: string, params?: unknown, timeoutMs = 20_000): Promise<unknown> {
    const id = ++this.seq;
    this.stdin.write(encodeFrame({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC 超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.stdin.write(encodeFrame({ jsonrpc: "2.0", method, params }));
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  rejectAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private dispatch(msg: RpcMessage): void {
    if (typeof msg.id === "number" && ("result" in msg || "error" in msg)) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (typeof msg.method === "string") {
      this.notificationHandlers.get(msg.method)?.(msg.params);
    }
  }
}
