import { describe, expect, it } from 'vitest';

import { sanitizeMermaidCode } from './sanitizeMermaid';

describe('sanitizeMermaidCode', () => {
  it('给含花括号的边标签加引号（日志里的真实报错场景）', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A[worker.ts] -->|import { parentPort }| B[worker]');
    expect(out).toContain('-->|"import { parentPort }"|');
  });

  it('给含圆括号的边标签加引号', () => {
    expect(sanitizeMermaidCode('graph LR\n  A -->|call fn()| B')).toContain('-->|"call fn()"|');
  });

  it('覆盖各种边箭头形态（虚线/粗线/--x）', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A -.->|a{1}| B\n  C ==>|c{2}| D\n  E --x|e{3}| F');
    expect(out).toContain('-.->|"a{1}"|');
    expect(out).toContain('==>|"c{2}"|');
    expect(out).toContain('--x|"e{3}"|');
  });

  it('无风险字符的标签保持原样', () => {
    const input = 'flowchart TD\n  A -->|yes| B';
    expect(sanitizeMermaidCode(input)).toBe(input);
  });

  it('已加引号的标签不重复加引号', () => {
    const input = 'flowchart TD\n  A -->|"import { x }"| B';
    expect(sanitizeMermaidCode(input)).toBe(input);
  });

  it('标签内已有的双引号会被转义', () => {
    expect(sanitizeMermaidCode('flowchart TD\n  A -->|say "hi" {x}| B')).toContain('|"say &quot;hi&quot; {x}"|');
  });

  it('非 flowchart 图（sequenceDiagram）不动 pipe', () => {
    const input = 'sequenceDiagram\n  Alice->>John: Hello |{x}|';
    expect(sanitizeMermaidCode(input)).toBe(input);
  });

  it('一行多个边标签都会处理', () => {
    const out = sanitizeMermaidCode('flowchart LR\n  A -->|a{1}| B -->|b(2)| C');
    expect(out).toContain('-->|"a{1}"|');
    expect(out).toContain('-->|"b(2)"|');
  });

  it('节点文本里的单个 `|` 不被误伤', () => {
    const out = sanitizeMermaidCode('flowchart TD\n  A["a or b"] -->|ok| B');
    expect(out).toContain('A["a or b"]');
    expect(out).toContain('-->|ok|');
  });

  it('真实 subgraph 图（节点已加引号、无裸边标签）不被误伤', () => {
    const input = [
      'flowchart TD',
      '    subgraph "Node 当前实现"',
      "        A[\"parse-worker.ts<br/>worker_threads API<br/>parentPort.on('message')\"]",
      '    end',
      '    subgraph "Bun 兼容性路径"',
      "        C[\"parse-worker.ts (修改)<br/>import { Worker } from 'worker_threads'<br/>Bun 有 partial polyfill\"]",
      '    end',
      '    style A fill:#e1f5fe',
      '    style C fill:#fff3e0',
    ].join('\n');
    expect(sanitizeMermaidCode(input)).toBe(input);
  });
});
