// 通用「提问选择」helper：让 AI 提一道选择题——即时弹出选项并阻塞等待（ctx.ui.select），
// 用户选完后在对话流留下一张「问题 + 答案」卡片（customType=agent-answer，前端渲染 AnswerCard），
// 便于回看与留痕。任何扩展都可复用（plan 澄清、危险操作确认、分支选择等）。
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface AnswerCardPayload {
  title: string;
  answer: string;
}

/**
 * 提一道单选题。返回用户选中的选项文本；非交互（无 UI）时返回 undefined（不留卡片）。
 * 选完后通过 sendMessage 留下持久的「问题+答案」卡片（不触发新一轮）。
 */
export async function askChoice(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  title: string,
  options: string[],
): Promise<string | undefined> {
  if (!ctx.hasUI) return undefined;
  const answer = await ctx.ui.select(title, options);
  if (answer === undefined || answer === null) return undefined;
  recordAnswer(pi, { title, answer: String(answer) });
  return String(answer);
}

/** 把一条「问题+答案」记录为对话流卡片（持久）。供已有自定义提问流程在拿到答案后调用。 */
export function recordAnswer(pi: ExtensionAPI, payload: AnswerCardPayload): void {
  pi.sendMessage(
    {
      customType: "agent-answer",
      content: JSON.stringify(payload),
      display: true,
    },
    { triggerTurn: false },
  );
}
