// 常驻 JS 执行内核（Pi code-exec 的 js_run/js_reset）。
// 读 stdin NDJSON，在 node:vm 持久 context 执行 JS，回写一行 NDJSON 结果。
// completion value 回显（vm 返回末尾表达式值）；var/全局赋值跨 cell 持久（顶层 let/const 块级不持久）。
import vm from "node:vm";
import { inspect } from "node:util";

function makeContext() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

let context = makeContext();

function fmt(args) {
  return args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 4 }))).join(" ");
}

function run(code, timeoutMs) {
  let stdout = "";
  let stderr = "";
  context.console = {
    log: (...a) => {
      stdout += `${fmt(a)}\n`;
    },
    info: (...a) => {
      stdout += `${fmt(a)}\n`;
    },
    debug: (...a) => {
      stdout += `${fmt(a)}\n`;
    },
    warn: (...a) => {
      stderr += `${fmt(a)}\n`;
    },
    error: (...a) => {
      stderr += `${fmt(a)}\n`;
    },
  };
  let value = null;
  let ok = true;
  let error = null;
  try {
    // timeout 仅对同步代码生效（第一版无 top-level await）；超时抛错被捕获，内核存活。
    const result = vm.runInContext(code, context, { filename: "<cell>", timeout: timeoutMs });
    if (result !== undefined) value = inspect(result, { depth: 4 });
  } catch (e) {
    ok = false;
    error = e && e.stack ? String(e.stack) : String(e);
  }
  return { stdout, stderr, value, ok, error };
}

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function handle(line) {
  const s = line.trim();
  if (!s) return;
  let msg;
  try {
    msg = JSON.parse(s);
  } catch {
    return;
  }
  const id = msg.id;
  if (msg.type === "exec") {
    emit({ type: "result", id, ...run(msg.code ?? "", msg.timeoutMs) });
  } else if (msg.type === "reset") {
    context = makeContext();
    emit({ type: "result", id, stdout: "", stderr: "", value: null, ok: true, error: null });
  } else if (msg.type === "ping") {
    emit({ type: "pong", id });
  } else {
    emit({ type: "result", id, stdout: "", stderr: "", value: null, ok: false, error: `unknown command type: ${msg.type}` });
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx = buf.indexOf("\n");
  while (idx >= 0) {
    handle(buf.slice(0, idx));
    buf = buf.slice(idx + 1);
    idx = buf.indexOf("\n");
  }
});
