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
  it("injects a hidden mermaid preference on before_agent_start", async () => {
    const { pi, handlers } = makePi();
    diagramHint(pi);
    const res = (await handlers["before_agent_start"]({}, {})) as
      | { message?: { content?: string; display?: boolean; customType?: string } }
      | undefined;
    expect(res?.message?.content).toBe(DIAGRAM_HINT);
    expect(res?.message?.content).toContain("mermaid");
    expect(res?.message?.display).toBe(false);
    expect(res?.message?.customType).toBe("diagram-hint");
  });

  it("does nothing when DIAGRAM_HINT=0", async () => {
    process.env.DIAGRAM_HINT = "0";
    const { pi, handlers } = makePi();
    diagramHint(pi);
    const res = await handlers["before_agent_start"]({}, {});
    expect(res).toBeUndefined();
  });

  it("keeps the hint conditional (does not force diagrams)", () => {
    expect(DIAGRAM_HINT).toContain("若本来不需要图表则正常作答");
  });
});
