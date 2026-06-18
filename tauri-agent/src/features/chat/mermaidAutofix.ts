/**
 * Mermaid 渲染失败时的本地启发式修复：只覆盖确定性的、常见的语法坑，能本地修掉的就不必
 * 惊动 AI。修不了返回 null，交给上层降级到错误卡片 /「让 AI 修复」。
 */

/**
 * gantt：task 的 metadata 第一段若写成「数字-数字」（如版本号 87-88 / 94-95），会被 mermaid
 * 当成 startDate 解析；连字符数字不是合法日期 → "Invalid date:87-88" 整图渲染中止。
 * （两段 metadata `:X, 时长` 的第一段总被当 startDate，加字母前缀也救不了——`t87_88` 仍按
 * 日期解析失败。）这类「伪 id」既不显示也无引用价值，直接移除，让该 task 退化为「仅时长」
 * 接续排期，使整图能渲染出来。
 *
 * 仅匹配 task 行（`名称 :` 前缀 + 其后形如 87-88 的 token + 逗号），不会误伤纯数字日期
 * `:85, 2026-06-16, 1d`（要求至少一个连字符），也不会误伤无 `:` 的 dateFormat / axisFormat。
 */
function fixGanttBadTaskId(code: string): string {
  return code.replace(
    /(^[ \t]*[^\n:]*:[ \t]*)\d+(?:-\d+)+[ \t]*,[ \t]*/gm,
    (_m, prefix: string) => prefix,
  );
}

/**
 * 尝试本地修复一段 mermaid 源码。返回修复后的新代码；没有可修的地方返回 null。
 */
export function autoFixMermaid(code: string): string | null {
  const firstWord = code.trim().split(/\s+/)[0]?.toLowerCase();
  let fixed = code;

  if (firstWord === 'gantt') {
    fixed = fixGanttBadTaskId(fixed);
  }

  return fixed === code ? null : fixed;
}
