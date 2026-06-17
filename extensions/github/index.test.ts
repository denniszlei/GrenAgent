import { describe, expect, it } from "vitest";
import github from "./index.js";

describe("github extension", () => {
  it("registers the github tool", () => {
    const names: string[] = [];
    const pi = {
      registerTool: (tool: { name: string }) => {
        names.push(tool.name);
      },
    };
    github(pi as unknown as Parameters<typeof github>[0]);
    expect(names).toEqual(["github"]);
  });
});
