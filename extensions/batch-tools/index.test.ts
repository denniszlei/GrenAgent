import { describe, expect, it } from "vitest";
import batchTools from "./index.js";

function fakePi() {
  const tools: string[] = [];
  return { tools, registerTool: (t: { name: string }) => tools.push(t.name) };
}

describe("batch-tools entry", () => {
  it("registers read_files and search by default", () => {
    const prev = process.env.BATCH_TOOLS_ENABLED;
    delete process.env.BATCH_TOOLS_ENABLED;
    const pi = fakePi();
    batchTools(pi as never);
    expect(pi.tools).toContain("read_files");
    expect(pi.tools).toContain("search");
    if (prev !== undefined) process.env.BATCH_TOOLS_ENABLED = prev;
  });
  it("registers nothing when BATCH_TOOLS_ENABLED=0", () => {
    process.env.BATCH_TOOLS_ENABLED = "0";
    const pi = fakePi();
    batchTools(pi as never);
    expect(pi.tools).toEqual([]);
    delete process.env.BATCH_TOOLS_ENABLED;
  });
});
