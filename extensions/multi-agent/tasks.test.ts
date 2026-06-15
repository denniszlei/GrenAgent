import { describe, expect, it } from "vitest";
import { normalizeTasks } from "./tasks.js";

describe("normalizeTasks", () => {
  it("single task with tool-level model", () => {
    expect(normalizeTasks({ task: "  do X  ", model: " gpt-4o " })).toEqual([{ task: "do X", model: "gpt-4o" }]);
  });
  it("single task without model", () => {
    expect(normalizeTasks({ task: "do X" })).toEqual([{ task: "do X" }]);
  });
  it("string tasks keep default model (undefined)", () => {
    expect(normalizeTasks({ tasks: ["a", " b "] })).toEqual([{ task: "a" }, { task: "b" }]);
  });
  it("object tasks carry per-task model", () => {
    expect(normalizeTasks({ tasks: [{ task: "a", model: "m1" }, { task: "b" }] })).toEqual([
      { task: "a", model: "m1" },
      { task: "b" },
    ]);
  });
  it("mixes single + tasks, drops blanks", () => {
    expect(normalizeTasks({ task: "head", model: "m0", tasks: ["", "  ", { task: "tail", model: "m2" }] })).toEqual([
      { task: "head", model: "m0" },
      { task: "tail", model: "m2" },
    ]);
  });
  it("empty → []", () => {
    expect(normalizeTasks({})).toEqual([]);
  });
});
