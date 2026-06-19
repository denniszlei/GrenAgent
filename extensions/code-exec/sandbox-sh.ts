// sandbox_sh：在 WSL2 隔离环境(srt: bubblewrap+seccomp+网络代理)内执行 shell 命令。
// 因 pi 内置 bash 无法被扩展改路由（spike 取 B 路），沙箱模式下由 safety 禁内置 bash、
// 引导改用本工具。写仅限 workspace、网络默认禁（由 SandboxSpec → srt settings 决定）。
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getSandbox } from "../_shared/sandbox/index.js";

export function registerSandboxSh(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sandbox_sh",
    label: "Sandboxed Shell",
    description:
      "在隔离环境(WSL2 沙箱)内执行 shell 命令：写仅限当前 workspace、网络默认禁。" +
      "适合在受限/不可信场景下安全跑命令（git/构建/测试等）。沙箱不可用时不执行。",
    parameters: Type.Object({
      command: Type.String({ description: "要在沙箱内执行的 shell 命令（bash -lc）" }),
      timeout_ms: Type.Optional(Type.Number({ description: "执行超时（毫秒），默认 120000" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sbx = await getSandbox();
      if (!(await sbx.isAvailable())) {
        return { content: [{ type: "text", text: "沙箱不可用：未配置 WSL2/srt，命令未执行。" }] };
      }
      const r = await sbx.exec(params.command ?? "", { cwd: ctx.cwd, timeoutMs: params.timeout_ms ?? 120_000 });
      const text = (r.stdout + (r.stderr ? `\n${r.stderr}` : "")).trim() || "(no output)";
      return { content: [{ type: "text", text }], details: { ok: r.code === 0 } };
    },
  });
}
