// 运行时日志存储：内存 ring buffer + 给 agent 阅读的格式化。无 I/O，便于单测。
// 由 debug-tools 的 HTTP 收集器与 debug_log 工具共用。

export interface LogEntry {
  seq: number;
  /** epoch 毫秒。 */
  ts: number;
  /** 标签：agent 插桩时用来区分假设/位置（如 "hypo1-entry"）。 */
  tag: string;
  /** 任意结构化诊断数据（变量值、执行路径标记、耗时等）。 */
  data: unknown;
}

const DEFAULT_CAPACITY = 2000;
// 内存总字节上限：单条上限由 server 的 MAX_BODY_BYTES 控制，这里再封顶总量，
// 防被调试程序大量 POST 接近上限的 payload 把内存撑到 capacity×单条上限（最坏数 GB）。
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

function safeJson(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function hhmmssmmm(ts: number): string {
  // 取 ISO 的时分秒毫秒部分（HH:MM:SS.mmm），避免时区噪声、便于看时序。
  const iso = new Date(ts).toISOString();
  return iso.slice(11, 23);
}

// 单条占用的近似字节（粗估，用于内存上限控制；不求精确）。
function approxSize(e: LogEntry): number {
  return safeJson(e.data).length + e.tag.length + 32;
}

export class LogStore {
  private entries: LogEntry[] = [];
  private sizes: number[] = [];
  private seq = 0;
  private dropped = 0;
  private bytes = 0;
  private readonly capacity: number;
  private readonly maxBytes: number;

  constructor(capacity: number = DEFAULT_CAPACITY, maxBytes: number = DEFAULT_MAX_BYTES) {
    this.capacity = Math.max(1, Math.floor(capacity) || DEFAULT_CAPACITY);
    this.maxBytes = Math.max(1024, Math.floor(maxBytes) || DEFAULT_MAX_BYTES);
  }

  /** 追加一条日志，分配单调 seq 与时间戳；超出条数或字节上限时丢弃最旧并计数。 */
  push(input: { tag?: unknown; data?: unknown; ts?: unknown }): LogEntry {
    const entry: LogEntry = {
      seq: ++this.seq,
      ts: typeof input.ts === "number" && Number.isFinite(input.ts) ? input.ts : Date.now(),
      tag: typeof input.tag === "string" && input.tag.trim() ? input.tag.trim() : "log",
      data: input.data ?? null,
    };
    this.entries.push(entry);
    this.sizes.push(approxSize(entry));
    this.bytes += this.sizes[this.sizes.length - 1];
    // 同时受条数与总字节上限约束：超出即丢最旧（至少保留当前这一条）。
    while (this.entries.length > this.capacity || (this.bytes > this.maxBytes && this.entries.length > 1)) {
      this.entries.shift();
      this.bytes -= this.sizes.shift() ?? 0;
      this.dropped++;
    }
    return entry;
  }

  readAll(): LogEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }

  droppedCount(): number {
    return this.dropped;
  }

  /** 开始新一轮：清空内存并重置 seq/dropped（文件截断由调用方负责）。 */
  clear(): void {
    this.entries = [];
    this.sizes = [];
    this.seq = 0;
    this.dropped = 0;
    this.bytes = 0;
  }

  /** 渲染成给 agent 阅读的纯文本；limit>0 时只取最近 N 条。 */
  formatForAgent(limit?: number): string {
    const all = this.entries;
    const slice = typeof limit === "number" && limit > 0 ? all.slice(-limit) : all;
    if (slice.length === 0) return "(no logs captured yet)";
    const header = this.dropped > 0 ? `(${this.dropped} earliest entries dropped due to capacity)\n` : "";
    const lines = slice.map((e) => `#${e.seq} ${hhmmssmmm(e.ts)} [${e.tag}] ${safeJson(e.data)}`);
    return header + lines.join("\n");
  }
}
