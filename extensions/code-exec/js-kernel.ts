import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { type ExecResult, LineBuffer, encodeExec, encodeReset, parseMessage } from "./protocol.js";

export interface ExecOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

let counter = 0;
const nextId = () => `j${++counter}`;

interface Pending {
  resolve: (r: ExecResult) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  onAbort?: () => void;
  signal?: AbortSignal;
}

// 常驻 JS 内核：spawn 当前 node(process.execPath) 跑 runner.mjs，逐条 exec，结果按 id 关联回 Promise。
// 超时/中断会重启进程（命名空间随之丢失，由上层提示）。按 cwd 各持一个实例。复用 protocol.ts。
export class JsKernel {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<string, Pending>();
  private readonly outBuf = new LineBuffer();

  constructor(
    private readonly runnerPath: string,
    private readonly cwd: string,
  ) {}

  private ensure(): void {
    if (this.child && !this.child.killed) return;
    const child = spawn(process.execPath, [this.runnerPath], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    }) as ChildProcessWithoutNullStreams;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.on("exit", () => this.onExit());
    child.on("error", () => this.onExit());
    this.child = child;
  }

  private onStdout(chunk: string): void {
    for (const line of this.outBuf.push(chunk)) {
      const msg = parseMessage(line);
      if (!msg || typeof msg.id !== "string" || msg.type !== "result") continue;
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.clearPending(msg.id, p);
      p.resolve(msg as ExecResult);
    }
  }

  private onExit(): void {
    this.child = undefined;
    const err = new Error("JS 内核进程已退出");
    for (const [id, p] of this.pending) {
      this.clearPending(id, p);
      p.reject(err);
    }
  }

  private clearPending(id: string, p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    if (p.onAbort && p.signal) p.signal.removeEventListener("abort", p.onAbort);
    this.pending.delete(id);
  }

  async exec(code: string, opts: ExecOptions = {}): Promise<ExecResult> {
    this.ensure();
    const id = nextId();
    const vmTimeoutMs = opts.timeoutMs ?? 30_000;
    // runner 内 vm 级超时先触发（中断该 cell、保留内核状态）；kernel 级超时多 2s 兜底，仅进程真挂死才杀。
    const killTimeoutMs = vmTimeoutMs + 2000;
    return new Promise<ExecResult>((resolve, reject) => {
      const p: Pending = { resolve, reject, signal: opts.signal };
      const fail = (msg: string) => {
        const cur = this.pending.get(id);
        if (cur) this.clearPending(id, cur);
        this.restart();
        reject(new Error(msg));
      };
      p.timer = setTimeout(() => fail(`执行超时（${killTimeoutMs}ms），已重启内核`), killTimeoutMs);
      if (opts.signal) {
        if (opts.signal.aborted) {
          fail("已中断");
          return;
        }
        p.onAbort = () => fail("已中断");
        opts.signal.addEventListener("abort", p.onAbort, { once: true });
      }
      this.pending.set(id, p);
      this.child?.stdin.write(encodeExec(id, code, vmTimeoutMs));
    });
  }

  async reset(): Promise<void> {
    this.ensure();
    const id = nextId();
    await new Promise<ExecResult>((resolve, reject) => {
      const p: Pending = { resolve, reject };
      p.timer = setTimeout(() => {
        const cur = this.pending.get(id);
        if (cur) this.clearPending(id, cur);
        reject(new Error("reset 超时"));
      }, 5000);
      this.pending.set(id, p);
      this.child?.stdin.write(encodeReset(id));
    });
  }

  restart(): void {
    this.dispose();
  }

  dispose(): void {
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    try {
      child.stdin.end();
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      /* already gone */
    }
  }
}
