// Plan 卡片化：把规划阶段的助手输出解析为结构化 Plan 卡数据，并把完整计划写入
// .pi/plans/<id>.md（对话流卡片的 View Plan 按路径读它）。
// 解析为纯函数（无 I/O，便于单测）；仅 writePlanFile 触碰文件系统。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TodoItem } from "./utils.js";

export interface PlanCardTodo {
  text: string;
  done: boolean;
}

// 对话流内 Plan 摘要卡的数据（agent-mode 经 sendMessage(customType:"agent-plan") 产出，
// content 为本结构的 JSON 字符串；前端 PlanCard 解析渲染）。
export interface PlanCardData {
  kind: "plan";
  id: string;
  title: string;
  summary: string;
  todos: PlanCardTodo[];
  planFile: string; // 相对工作区路径，形如 .pi/plans/<id>.md
  status: "draft" | "executing" | "done";
}

function stripInline(s: string): string {
  return s
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// 生成可排序的 plan id：plan-YYYYMMDD-HHMMSS-rand。
export function makePlanId(now: Date = new Date(), rand: string = Math.random().toString(36).slice(2, 6)): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `plan-${stamp}-${rand}`;
}

// 标题：优先首个 markdown 一/二/三级标题；其次首个非空、非「Plan:」行；回退「实施计划」。
export function derivePlanTitle(text: string): string {
  const heading = text.match(/^\s{0,3}#{1,3}\s+(.+?)\s*$/m);
  if (heading) return clip(stripInline(heading[1]), 60);
  const firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^plan:/i.test(l) && !/^#{1,6}\s*$/.test(l));
  if (firstLine) return clip(stripInline(firstLine.replace(/^[-*]\s+/, "")), 60);
  return "实施计划";
}

// 摘要：标题之后、Plan: 之前的首个普通段落（非标题/列表/编号）。无则给占位文案。
export function derivePlanSummary(text: string): string {
  let body = text;
  const heading = text.match(/^\s{0,3}#{1,3}\s+.+$/m);
  if (heading && heading.index !== undefined) body = text.slice(heading.index + heading[0].length);
  const planIdx = body.search(/^\s*\*{0,2}plan:/im);
  if (planIdx >= 0) body = body.slice(0, planIdx);
  const para = body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .find((s) => s.length > 0 && !/^[#\-*]/.test(s) && !/^\d+[.)]/.test(s));
  if (para) return clip(stripInline(para.replace(/\s*\n\s*/g, " ")), 200);
  return "已生成实施计划，点 View Plan 查看完整步骤。";
}

// 组装卡数据（不含文件写入）：标题/摘要从全文解析，todos 取自已提取的编号步骤。
export function buildPlanCard(
  id: string,
  fullText: string,
  todos: TodoItem[],
  planFile: string,
): PlanCardData {
  return {
    kind: "plan",
    id,
    title: derivePlanTitle(fullText),
    summary: derivePlanSummary(fullText),
    todos: todos.map((t) => ({ text: t.text, done: t.completed })),
    planFile,
    status: "draft",
  };
}

// 写入文件的 markdown：标题 + 摘要 + 编号步骤概览 + 规划原文（保留 AI 的完整产出）。
export function renderPlanMarkdown(data: PlanCardData, fullText: string): string {
  const lines: string[] = [`# ${data.title}`, ""];
  if (data.summary) lines.push(data.summary, "");
  if (data.todos.length > 0) {
    lines.push("## 步骤", "");
    data.todos.forEach((t, i) => lines.push(`${i + 1}. ${t.text}`));
    lines.push("");
  }
  lines.push("---", "", "## 规划原文", "", fullText.trim(), "");
  return lines.join("\n");
}

// 写 .pi/plans/<id>.md，返回 POSIX 风格相对路径（供前端 read_file 读取）。
export function writePlanFile(cwd: string, id: string, markdown: string): string {
  const dir = join(cwd, ".pi", "plans");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), markdown, "utf8");
  return `.pi/plans/${id}.md`;
}
