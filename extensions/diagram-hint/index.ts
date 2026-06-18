// diagram-hint: 引导模型用 ```mermaid 代码块输出图表，而不是 ASCII 字符画。
//
// 背景：客户端 Markdown（@lobehub/ui）默认就渲染 mermaid 代码块为矢量图，但部分模型
// （如 deepseek 系）习惯输出 ASCII 流程图，无法被渲染。本扩展在每轮开始前注入一条简短的
// system 偏好（display:false，不进可见对话），措辞是条件性的——只在「确实要画图」时才用
// mermaid，不会诱导模型无谓地画图。可经 DIAGRAM_HINT=0 关闭。
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";

export const DIAGRAM_HINT =
  "输出图表时优先用 ```mermaid 代码块（流程图 flowchart、时序图 sequenceDiagram、" +
  "状态图 stateDiagram-v2、类图 classDiagram、ER 图 erDiagram、甘特图 gantt、饼图 pie 等），" +
  "客户端会把它渲染成矢量图；不要用 ASCII / 方框字符画。若本来不需要图表则正常作答，勿强行画图。" +
  "（这是渲染用的系统提示，不是用户偏好：无需在回复里确认或复述它，也不要因此调用 memory_save 之类工具去记忆它。）";

const enabled = () => (getConfig("DIAGRAM_HINT") ?? "1") !== "0";

export default function (pi: ExtensionAPI) {
  console.error("[diagram-hint] extension loaded");

  pi.on("before_agent_start", async () => {
    if (!enabled()) return undefined;
    return {
      message: {
        customType: "diagram-hint",
        content: DIAGRAM_HINT,
        display: false,
      },
    };
  });
}
