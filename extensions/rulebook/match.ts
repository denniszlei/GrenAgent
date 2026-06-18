// 规则匹配（纯函数，便于单测）。
import type { Rule } from "./rules.js";

// 极简 glob → 锚定 RegExp：* → .*，? → 单字符，其余字面转义。
export function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

function extractPath(input: unknown): string | undefined {
  const o = (input ?? {}) as Record<string, unknown>;
  for (const k of ["path", "file", "filePath", "filename"]) {
    const v = o[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function argsMatch(spec: Record<string, string> | undefined, input: unknown): boolean {
  if (!spec) return true;
  const o = (input ?? {}) as Record<string, unknown>;
  for (const [k, pat] of Object.entries(spec)) {
    const v = o[k];
    if (typeof v !== "string" || !globToRegExp(pat).test(v)) return false;
  }
  return true;
}

// 工具调用是否命中规则（仅 tool / path 类用于工具边界拦截）。
export function matchToolCall(rule: Rule, toolName: string, input: unknown): boolean {
  if (rule.when.kind === "tool") {
    return globToRegExp(rule.when.tool).test(toolName) && argsMatch(rule.when.argsMatch, input);
  }
  if (rule.when.kind === "path") {
    if (rule.when.tool && rule.when.tool !== toolName) return false;
    const p = extractPath(input);
    return p !== undefined && globToRegExp(rule.when.glob).test(p);
  }
  return false;
}

// 助手文本是否命中规则（text 类）。非法正则视为不命中。
export function matchText(rule: Rule, text: string): boolean {
  if (rule.when.kind !== "text") return false;
  try {
    return new RegExp(rule.when.pattern, "i").test(text);
  } catch {
    return false;
  }
}
