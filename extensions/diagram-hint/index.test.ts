import { afterEach, describe, expect, it } from "vitest";
import diagramHint, { DIAGRAM_HINT } from "./index.js";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

function makePi() {
  const handlers: Record<string, Handler> = {};
  const pi = {
    on: (event: string, handler: Handler) => {
      handlers[event] = handler;
    },
    registerTool: () => {},
    registerCommand: () => {},
  } as never;
  return { pi, handlers };
}

afterEach(() => {
  delete process.env.DIAGRAM_HINT;
});

describe("diagram-hint", () => {
  it("每轮 before_agent_start 隐式注入渲染约定（display:false）", async () => {
    const { pi, handlers } = makePi();
    diagramHint(pi);
    const res = (await handlers["before_agent_start"]({}, {})) as
      | { message?: { content?: string; display?: boolean; customType?: string } }
      | undefined;
    expect(res?.message?.content).toBe(DIAGRAM_HINT);
    expect(res?.message?.display).toBe(false);
    expect(res?.message?.customType).toBe("diagram-hint");
  });

  it("内容覆盖 mermaid 节点/subgraph 特殊字符转义 + 公式语法", () => {
    expect(DIAGRAM_HINT).toContain("mermaid");
    // 节点 label 含特殊字符要用双引号包住（第一次踩坑的例子）。
    expect(DIAGRAM_HINT).toContain('A["规约到 [0, π/2]"]');
    // subgraph 标题含特殊字符也要加引号（第二次踩坑：subgraph 第3层=结果）。
    expect(DIAGRAM_HINT).toContain('subgraph "第3层=结果"');
    // 公式语法：用 $$ 且明确不要用 \(。
    expect(DIAGRAM_HINT).toContain("$$");
    expect(DIAGRAM_HINT).toContain("\\(");
  });

  it("保持条件性（不强行画图/写公式）", () => {
    expect(DIAGRAM_HINT).toContain("本来不需要");
  });

  it("DIAGRAM_HINT=0 时不注入", async () => {
    process.env.DIAGRAM_HINT = "0";
    const { pi, handlers } = makePi();
    diagramHint(pi);
    const res = await handlers["before_agent_start"]({}, {});
    expect(res).toBeUndefined();
  });
});
