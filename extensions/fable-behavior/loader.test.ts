import { describe, expect, it } from "vitest";
import { buildFableBehaviorPrompt, resolveAgentModeFromEntries } from "./loader.js";

describe("buildFableBehaviorPrompt", () => {
  it("includes tier1 harness rules", () => {
    const p = buildFableBehaviorPrompt({ tier2: false, tier3Guidelines: false, date: "2026-06-20" });
    expect(p).toContain("[Fable Behavior]");
    expect(p).toContain("read` at least once before editing");
    expect(p).toContain("Current date: 2026-06-20");
  });

  it("includes tier2 when enabled", () => {
    const p = buildFableBehaviorPrompt({ tier2: true, tier3Guidelines: false });
    expect(p).toContain("Tool discipline");
    expect(p).toContain("Grep and glob strategy");
    expect(p).toContain("Terminal and sidecar harness");
    expect(p).toContain("Conventions first");
  });

  it("adds ask mode slice", () => {
    const p = buildFableBehaviorPrompt({ tier2: false, tier3Guidelines: false, mode: "ask" });
    expect(p.toLowerCase()).toContain("read-only");
  });

  it("adds tier3 summary when enabled", () => {
    const p = buildFableBehaviorPrompt({ tier2: false, tier3Guidelines: true });
    expect(p).toContain("Quick reference");
    expect(p).toContain("Copyright");
  });
});

describe("resolveAgentModeFromEntries", () => {
  it("reads agent-mode session entry", () => {
    const mode = resolveAgentModeFromEntries([
      { type: "custom", customType: "agent-mode", data: { mode: "plan" } },
    ]);
    expect(mode).toBe("plan");
  });

  it("defaults to agent", () => {
    expect(resolveAgentModeFromEntries([])).toBe("agent");
  });
});
