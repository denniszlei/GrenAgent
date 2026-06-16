import { describe, expect, it } from "vitest";

describe("code-search factory", () => {
  it("registers code_search tool and /code-index command when enabled", async () => {
    process.env.CODE_SEARCH_ENABLED = "1";
    const { default: factory } = await import("./index.js");
    const tools: string[] = [];
    const commands: string[] = [];
    factory({
      registerTool: (t: { name: string }) => tools.push(t.name),
      registerCommand: (n: string) => commands.push(n),
      on: () => {},
    } as never);
    expect(tools).toContain("code_search");
    expect(commands).toContain("code-index");
  });
});
