// goal: set a session completion condition; on agent_end an independent judge
// LLM decides whether it is actually met. If not, re-enter (triggerTurn) with
// the reason until met / react cap / user abort. Fail-open on any judge failure.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { type AskFn, askLlm, resolveModel } from "./llm.js";
import { judge } from "./judge.js";
import { type GoalState, restoreFromEntries } from "./state.js";

const enabled = () => (getConfig("GOAL_ENABLED") ?? "1") !== "0";
const maxReact = () => Number(getConfig("GOAL_MAX_REACT") ?? "12") || 12;
const goalModel = () => getConfig("GOAL_MODEL");

export default function (pi: ExtensionAPI) {
  let state: GoalState | undefined;

  const persist = () => pi.appendEntry("goal", state ?? null);

  const setStatus = (ctx: ExtensionContext) =>
    ctx.ui.setStatus("goal", state ? `goal: ${state.condition.slice(0, 24)}` : undefined);

  const makeAsk = (ctx: ExtensionContext): AskFn | undefined => {
    const model = resolveModel(
      ctx.model as never,
      (ctx.modelRegistry ?? { find: () => undefined }) as never,
      goalModel(),
    );
    if (!model) return undefined;
    return (system, user) => askLlm(model, system, user, ctx.signal);
  };

  const clear = (ctx: ExtensionContext) => {
    state = undefined;
    persist();
    setStatus(ctx);
  };

  pi.registerCommand("goal", {
    description: "设定/清除会话完成条件：/goal <条件> | /goal clear",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text || text === "clear") {
        clear(ctx);
        ctx.ui.notify("已清除目标。", "info");
        return;
      }
      state = { condition: text, react: 0 };
      persist();
      setStatus(ctx);
      ctx.ui.notify(`已设定目标：${text}`, "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    state = restoreFromEntries(ctx.sessionManager.getEntries() as never);
    setStatus(ctx);
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!enabled() || !state) return;
    if (ctx.signal?.aborted) return; // user abort → do not re-enter

    const ask = makeAsk(ctx);
    if (!ask) {
      ctx.ui.notify("Goal: 无可用裁判模型，已放行。", "warning");
      clear(ctx);
      return;
    }

    const verdict = await judge(ask, event.messages as unknown[], state.condition);
    if (verdict.ok) {
      ctx.ui.notify(`目标达成：${state.condition}`, "info");
      clear(ctx);
      return;
    }
    if (state.react >= maxReact()) {
      ctx.ui.notify(`Goal: 已达重入上限(${maxReact()})，停止。最后判定：${verdict.reason}`, "warning");
      clear(ctx);
      return;
    }
    state.react += 1;
    persist();
    setStatus(ctx);
    pi.sendMessage(
      {
        customType: "goal-reentry",
        content: `目标尚未达成：${verdict.reason}\n请继续完成目标：${state.condition}`,
        display: true,
      },
      { triggerTurn: true },
    );
  });
}
