// Context-Explorer：只读探索子代理。复用 multi-agent 运行时，把探索 token 关在
// 子代理窗口里，只回紧凑 path:start-end 引用（FastContext 的探索/解题分离）。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import type { CapabilityProfile } from "../multi-agent/capability.js";
import { profileToEnv, profileToModel } from "../multi-agent/capability.js";
import { spawnPiAgent } from "../multi-agent/runner.js";
import { getEngine } from "./engines.js";

// 改编自 FastContext system.md：只读、并行工具、优先预建索引（codegraph_explore），
// 再用 Glob/Grep/Read 补缺，最后只输出 <final_answer> 引用块。
export const EXPLORE_SYSTEM_PROMPT = `You are a read-only code exploration sub-agent.

Your job: answer the caller's question about THIS repository by locating the
relevant code, then return a COMPACT set of references — not full file dumps.

Rules:
- READ-ONLY. Never edit, write, or run build/mutating commands.
- Prefer the pre-built index first: if codegraph_* tools are available, use
  codegraph_explore / codegraph_search / codegraph_node to find symbols, call
  paths and source in one shot. They are far cheaper than scanning files.
- Fall back to Glob / Grep / Read only to fill gaps the index didn't cover.
- Run independent lookups in parallel.
- Stop as soon as you can answer; do not over-explore.

Output: end your turn with exactly one block:

<final_answer>
- path/to/file.ts:120-145 - one short sentence on why this is relevant
- path/to/other.ts:8-30 - ...
</final_answer>

Each line is a path:start-end reference plus a one-sentence note. Keep it tight:
the caller has NOT seen the files you read, and only this block returns to them.`;

/**
 * 纯函数：由「当前引擎名 + 是否已索引」推导探索子代理的 capability。
 * 已索引且引擎有效 → 开放该引擎的 MCP（codegraph_* 工具）；否则降级为
 * 纯 Read/Glob/Grep（mcp:false）。始终只读、禁 bash、禁 web、便宜模型档。
 */
export function buildExploreProfile(engineName: string, indexed: boolean): CapabilityProfile {
  const engine = engineName === "off" ? undefined : getEngine(engineName);
  const useEngine = !!engine && indexed;
  return {
    name: "context-explorer",
    fs: "readonly",
    net: false,
    mcp: useEngine ? [engine!.serverName] : false,
    spawn: false,
    isolation: "process",
    model: "cheap",
    tools: { deny: ["bash"] },
  };
}

/** 纯函数：抽取 <final_answer> 块；缺失时回退整段输出（降级，不硬失败）。 */
export function extractFinalAnswer(output: string): string {
  const m = output.match(/<final_answer>([\s\S]*?)<\/final_answer>/i);
  return (m ? m[1] : output).trim();
}

/** 注册 explore_context 工具：在独立只读子代理里探索，回传紧凑引用。 */
export function registerExploreContext(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "explore_context",
    label: "Explore Context",
    description:
      "Delegate a repository question to a read-only exploration sub-agent (separate context window). " +
      "It prefers the built-in CodeGraph index (codegraph_* tools), falls back to Glob/Grep/Read, and " +
      "returns a COMPACT set of path:start-end references instead of full file contents.",
    promptGuidelines: [
      "For where/how/find questions about THIS repo, call explore_context instead of grepping/reading files yourself — it keeps the exploration tokens out of your context window.",
      "Pass a precise natural-language query; the sub-agent returns compact path:start-end references you can then open directly.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural-language question about the codebase to explore." }),
      max_turns: Type.Optional(Type.Number({ description: "Soft budget for tool-call rounds (default ~6)." })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      // 防嵌套：子代理不得再发起探索（双防线，另见 index.ts 跳过注册 + runner deny）。
      if (process.env.PI_IS_SUBAGENT === "1") {
        throw new Error("explore_context 不可在子代理内调用（嵌套探索已被拦截）");
      }
      const engineName = getConfig("CODE_INTEL") ?? "codegraph";
      const indexed = existsSync(join(ctx.cwd, ".codegraph"));
      const profile = buildExploreProfile(engineName, indexed);
      const model = getConfig("CODE_INTEL_EXPLORER_MODEL")?.trim() || profileToModel(profile, getConfig);
      const timeoutMs = Number(getConfig("CODE_INTEL_EXPLORER_TIMEOUT_MS") ?? "") || undefined;
      const budget = typeof params.max_turns === "number" && params.max_turns > 0 ? params.max_turns : undefined;
      const task = budget
        ? `${params.query}\n\n(Budget: about ${budget} tool-call rounds — converge quickly.)`
        : params.query;

      const r = await spawnPiAgent(ctx.cwd, task, {
        model,
        systemPrompt: EXPLORE_SYSTEM_PROMPT,
        env: profileToEnv(profile),
        mcp: profile.mcp,
        timeoutMs,
        signal: signal ?? undefined,
        onUpdate: onUpdate
          ? (u) => onUpdate({ content: [{ type: "text", text: u.text }], details: { streaming: true } })
          : undefined,
      });
      if (!r.ok) {
        return {
          content: [{ type: "text", text: `explore_context failed: ${r.error ?? "unknown error"}` }],
          details: { engine: engineName, indexed, exitCode: r.exitCode },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: extractFinalAnswer(r.output) || "(no findings)" }],
        details: { engine: engineName, indexed, model: model ?? null },
      };
    },
  });
}
