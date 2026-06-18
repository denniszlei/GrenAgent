import { describe, expect, it } from "vitest";
import { normalizeTasks, spawnHasWork } from "./tasks.js";

describe("normalizeTasks", () => {
  it("single task", () => {
    expect(normalizeTasks({ task: "do x", model: "m" })).toEqual([{ task: "do x", model: "m", agent: undefined }]);
  });
  it("parallel string + object tasks (object agent overrides call agent)", () => {
    expect(normalizeTasks({ agent: "base", tasks: ["a", { task: "b", agent: "spec", model: "m" }] })).toEqual([
      { task: "a", agent: "base" },
      { task: "b", model: "m", agent: "spec" },
    ]);
  });
  it("ignores empty/whitespace tasks", () => {
    expect(normalizeTasks({ task: "   ", tasks: ["", "  ok  "] })).toEqual([{ task: "ok", agent: undefined }]);
  });
  it("chain is NOT folded into the normalized task list", () => {
    expect(normalizeTasks({ chain: [{ task: "s1" }, { task: "s2" }] })).toEqual([]);
  });
});

describe("spawnHasWork", () => {
  it("task / tasks count as work", () => {
    expect(spawnHasWork({ task: "x" })).toBe(true);
    expect(spawnHasWork({ tasks: ["x"] })).toBe(true);
  });
  // Regression: chain-only calls used to be rejected with "provide task or tasks"
  // because the guard ran normalizeTasks() (which ignores chain) before the chain branch.
  it("chain-only counts as work (the regression that broke chain)", () => {
    expect(spawnHasWork({ chain: [{ task: "s1" }, { task: "s2" }] })).toBe(true);
  });
  it("truly empty params are not work", () => {
    expect(spawnHasWork({})).toBe(false);
    expect(spawnHasWork({ tasks: [], chain: [] })).toBe(false);
  });
});
