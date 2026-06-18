// rulebook：声明式规则库 + 跑偏纠正（TTSR 的 turn 级等效）。
//
// 上游无 token 流钩子，无法 mid-token 中断（见 spec）。本扩展用既有钩子等效落地：
//   - 工具/路径规则（action=block）→ tool_call 钩子即时拦截并回灌规则文本（工具边界纠正）
//   - 文本规则（when.kind=text）→ turn_end 检测助手输出，命中则标记下一轮注入
//   - inject/persist → before_agent_start 注入规则上下文（persist 每轮重注，存活压缩）
// 规则来自 .pi/rules.jsonc。loop-guard 暂保留独立（收编为内置规则列二期）。
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchText, matchToolCall } from "./match.js";
import { type Rule, loadRules } from "./rules.js";

interface CwdState {
  rules: Rule[];
  pending: Set<string>; // 待下一轮注入的规则 id（命中后置入）
  injectedOnce: Set<string>; // 已注入过的 once 规则 id
}

function assistantText(message: { role?: string; content?: unknown } | undefined): string {
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return "";
  return message.content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: string }).type === "text"
        ? String((b as { text?: string }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

export default function (pi: ExtensionAPI) {
  console.error("[rulebook] extension loaded");
  const byCwd = new Map<string, CwdState>();

  const stateFor = (cwd: string): CwdState => {
    let s = byCwd.get(cwd);
    if (!s) {
      s = { rules: loadRules(cwd), pending: new Set(), injectedOnce: new Set() };
      byCwd.set(cwd, s);
    }
    return s;
  };

  pi.on("session_start", async (_event, ctx) => {
    byCwd.set(ctx.cwd, { rules: loadRules(ctx.cwd), pending: new Set(), injectedOnce: new Set() });
  });

  // 工具边界即时纠正：tool/path 规则。block → 拦截并回灌；warn → toast；inject → 标记下一轮注入。
  pi.on("tool_call", async (event, ctx) => {
    const st = stateFor(ctx?.cwd ?? "");
    for (const rule of st.rules) {
      if (rule.when.kind === "text") continue;
      if (!matchToolCall(rule, event.toolName, event.input)) continue;
      if (rule.action === "block") {
        return { block: true, reason: `规则「${rule.id}」：${rule.rule}` };
      }
      if (rule.action === "warn") {
        ctx?.ui.notify(`规则「${rule.id}」：${rule.rule}`, "warning");
      } else if (rule.action === "inject") {
        st.pending.add(rule.id);
      }
    }
    return undefined;
  });

  // 文本跑偏检测（turn 级）：text 规则命中助手输出 → 标记下一轮注入（或 warn 即时提示）。
  pi.on("turn_end", async (event, ctx) => {
    const st = stateFor(ctx?.cwd ?? "");
    const text = assistantText(event.message as { role?: string; content?: unknown });
    if (!text) return;
    for (const rule of st.rules) {
      if (rule.when.kind !== "text" || !matchText(rule, text)) continue;
      if (rule.action === "warn") ctx?.ui.notify(`规则「${rule.id}」：${rule.rule}`, "warning");
      else st.pending.add(rule.id);
    }
  });

  // 注入：pending（命中待注入）+ persist（每轮重注）。once 规则注入一次后不再重复。
  pi.on("before_agent_start", async (_event, ctx) => {
    const st = stateFor(ctx?.cwd ?? "");
    const ids = new Set<string>(st.pending);
    for (const r of st.rules) if (r.persist) ids.add(r.id);
    const chunks: string[] = [];
    for (const id of ids) {
      const rule = st.rules.find((r) => r.id === id);
      if (!rule) continue;
      if (rule.once && st.injectedOnce.has(id)) continue;
      chunks.push(`- 规则「${rule.id}」：${rule.rule}`);
      if (rule.once) st.injectedOnce.add(id);
    }
    st.pending.clear();
    if (chunks.length === 0) return undefined;
    return {
      message: { customType: "rulebook-reminder", content: `[规则提醒]\n${chunks.join("\n")}`, display: false },
    };
  });

  pi.registerCommand("rules", {
    description: "查看/重载规则：/rules | /rules reload",
    handler: async (args, ctx) => {
      const st = stateFor(ctx.cwd);
      if (args.trim() === "reload") {
        st.rules = loadRules(ctx.cwd);
        ctx.ui.notify(`已重载 ${st.rules.length} 条规则`, "info");
        return;
      }
      if (st.rules.length === 0) {
        ctx.ui.notify("当前无规则（在 .pi/rules.jsonc 定义）", "info");
        return;
      }
      const list = st.rules.map((r) => `${r.id} [${r.when.kind}/${r.action}]`).join("\n");
      ctx.ui.notify(`规则（${st.rules.length}）：\n${list}`, "info");
    },
  });
}
