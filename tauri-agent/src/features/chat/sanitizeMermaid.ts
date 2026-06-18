// 给 mermaid flowchart/graph 的 pipe 边标签里的特殊字符自动加引号。
//
// 背景：模型生成 mermaid 时常把代码片段塞进边标签，例如
//   A[worker.ts] -->|import { parentPort }| B[worker]
// mermaid 词法器会把标签里的 `{` 当成菱形节点 `X{...}` 的起始符（DIAMOND_START），导致解析失败。
// 用双引号包裹标签后，其中的特殊字符被当字面文本，解析即可通过。
//
// 仅处理 flowchart/graph 的 pipe 边标签（|label|），这是最常见、也是实际报错的场景；
// 其它图类型（sequenceDiagram/gantt 等）的 `|` 语义不同，保持不动以免误伤。

// 会破坏 pipe 边标签解析的字符。
const RISKY = /[{}()[\]]/;

// 紧跟边箭头收尾字符（> - . = x o）后的 pipe 标签：|label|
// 用前导字符把匹配限定在“边”上，避免误伤节点文本里偶发的成对 `|`。
const EDGE_LABEL = /([->.=xo])(\s*)\|([^|\n]+)\|/g;

function quoteLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;
  if (/^".*"$/.test(trimmed)) return label; // 已加引号
  if (!RISKY.test(label)) return label; // 无风险字符，保持原样，减少无谓改动
  return `"${label.replace(/"/g, '&quot;')}"`;
}

// 输入：单个 mermaid 图的源码（不含 ``` 围栏）。返回：边标签已加引号的安全版本。
export function sanitizeMermaidCode(code: string): string {
  const firstLine = code.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
  if (!/^(flowchart|graph)\b/i.test(firstLine)) return code;
  return code.replace(EDGE_LABEL, (_match, pre, gap, label) => `${pre}${gap}|${quoteLabel(label)}|`);
}
