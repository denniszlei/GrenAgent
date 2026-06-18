// 规则模型与加载。MVP 从 .pi/rules.jsonc 读用户规则（顶层数组或 { rules: [...] }）。
// .pi/rules/*.md frontmatter 形式属二期。纯逻辑（parse/校验）便于单测；loadRules 触碰 fs。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ToolWhen {
  kind: "tool";
  tool: string; // 工具名 glob（* 通配）
  argsMatch?: Record<string, string>; // 参数字段 → glob
}
export interface TextWhen {
  kind: "text";
  pattern: string; // 助手输出正则（忽略大小写）
}
export interface PathWhen {
  kind: "path";
  tool?: string; // 限定工具（edit/write/hl_edit…），省略=任意写工具
  glob: string; // 路径 glob
}
export type RuleWhen = ToolWhen | TextWhen | PathWhen;

export type RuleAction = "block" | "warn" | "inject";

export interface Rule {
  id: string;
  when: RuleWhen;
  action: RuleAction; // block=工具边界拦截；inject=下一轮注入；warn=仅提示
  rule: string; // 命中时的拦截理由 / 注入的规则文本
  once?: boolean; // 是否只生效一次
  persist?: boolean; // 是否每轮重注（存活上下文压缩）
}

export function isValidRule(v: unknown): v is Rule {
  const r = v as Partial<Rule> | null;
  if (!r || typeof r.id !== "string" || typeof r.rule !== "string") return false;
  if (r.action !== "block" && r.action !== "warn" && r.action !== "inject") return false;
  const w = r.when as RuleWhen | undefined;
  if (!w || typeof w !== "object") return false;
  if (w.kind === "tool") return typeof w.tool === "string";
  if (w.kind === "text") return typeof w.pattern === "string";
  if (w.kind === "path") return typeof w.glob === "string";
  return false;
}

// 极简 jsonc：去掉整行 // 注释后 JSON.parse；接受顶层数组或 { rules: [...] }。
export function parseRules(text: string): Rule[] {
  try {
    const json = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as unknown;
    const arr = Array.isArray(json)
      ? json
      : Array.isArray((json as { rules?: unknown })?.rules)
        ? (json as { rules: unknown[] }).rules
        : [];
    return arr.filter(isValidRule);
  } catch {
    return [];
  }
}

export function loadRules(cwd: string): Rule[] {
  const path = join(cwd, ".pi", "rules.jsonc");
  if (!existsSync(path)) return [];
  try {
    return parseRules(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}
