// DAP 连接层。DAP 走 Content-Length 帧（与 LSP 共享 FrameDecoder/encodeFrame），
// 但消息是 {seq, type:"request"|"response"|"event", command/event, ...}（非 JSON-RPC），
// 故自建 DapConnection 管理 seq、按 request_seq 关联响应、分发事件。
import type { Writable } from "node:stream";
import { FrameDecoder, encodeFrame } from "../_shared/jsonrpc-stdio.js";

interface DapResponse {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  body?: unknown;
  message?: string;
}

interface DapEventMessage {
  type: "event";
  event: string;
  body?: unknown;
}

type EventHandler = (body: unknown) => void;

export class DapConnection {
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (b: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly decoder = new FrameDecoder();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();

  constructor(private readonly stdin: Writable) {}

  feed(chunk: Buffer): void {
    for (const msg of this.decoder.push(chunk)) this.dispatch(msg as Record<string, unknown>);
  }

  request(command: string, args?: unknown, timeoutMs = 20_000): Promise<unknown> {
    const seq = ++this.seq;
    this.stdin.write(encodeFrame({ seq, type: "request", command, arguments: args }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`DAP 超时：${command}`));
      }, timeoutMs);
      this.pending.set(seq, {
        resolve: (b) => {
          clearTimeout(timer);
          resolve(b);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  onEvent(event: string, handler: EventHandler): void {
    let set = this.eventHandlers.get(event);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(event, set);
    }
    set.add(handler);
  }

  rejectAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  private dispatch(msg: Record<string, unknown>): void {
    if (msg.type === "response") {
      const r = msg as unknown as DapResponse;
      const p = this.pending.get(r.request_seq);
      if (!p) return;
      this.pending.delete(r.request_seq);
      if (r.success) p.resolve(r.body);
      else p.reject(new Error(r.message || `${r.command} 失败`));
    } else if (msg.type === "event") {
      const e = msg as unknown as DapEventMessage;
      const set = this.eventHandlers.get(e.event);
      if (set) for (const h of set) h(e.body);
    }
  }
}
