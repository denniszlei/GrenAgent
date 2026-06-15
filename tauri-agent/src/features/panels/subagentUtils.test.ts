import { describe, expect, it } from "vitest";
import { isBackgroundSpawn, subAgentId } from "./subagentUtils.js";

describe("subagentUtils ids", () => {
  it("subAgentId reads details.agentId", () => {
    expect(subAgentId({ details: { agentId: "sa-1" } })).toBe("sa-1");
    expect(subAgentId({})).toBeNull();
  });

  it("isBackgroundSpawn detects detached running spawn", () => {
    expect(isBackgroundSpawn({ details: { agentId: "sa-1", status: "running" } })).toBe(true);
    expect(isBackgroundSpawn({ details: { agentId: "sa-1", status: "running", transcript: "x" } })).toBe(
      false,
    );
    expect(isBackgroundSpawn({ details: { agentId: "sa-1", status: "done" } })).toBe(false);
  });
});
