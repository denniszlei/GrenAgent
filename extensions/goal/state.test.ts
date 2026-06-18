import { describe, expect, it } from "vitest";
import { restoreFromEntries } from "./state.js";

describe("restoreFromEntries", () => {
  it("returns undefined when no goal entry", () => {
    expect(restoreFromEntries([])).toBeUndefined();
    expect(restoreFromEntries([{ type: "custom", customType: "plan-mode", data: {} }])).toBeUndefined();
  });
  it("restores the latest goal entry (defaults paused=false for legacy data)", () => {
    expect(
      restoreFromEntries([{ type: "custom", customType: "goal", data: { condition: "c", react: 2 } }]),
    ).toEqual({ condition: "c", react: 2, paused: false });
  });
  it("restores the paused flag", () => {
    expect(
      restoreFromEntries([
        { type: "custom", customType: "goal", data: { condition: "c", react: 1, paused: true } },
      ]),
    ).toEqual({ condition: "c", react: 1, paused: true });
  });
  it("treats a cleared (null) latest goal entry as no goal", () => {
    expect(
      restoreFromEntries([
        { type: "custom", customType: "goal", data: { condition: "a", react: 1 } },
        { type: "custom", customType: "goal", data: null },
      ]),
    ).toBeUndefined();
  });
});
