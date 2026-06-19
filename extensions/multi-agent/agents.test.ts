import { describe, expect, it } from "vitest";
import { AGENT_ALIASES, resolveAgent, suggestAgent, type AgentConfig } from "./agents.js";

function agent(name: string): AgentConfig {
  return {
    name,
    description: `${name} description`,
    systemPrompt: `prompt-${name}`,
    source: "user",
    filePath: `/agents/${name}.md`,
  };
}

const defaults = ["scout", "planner", "reviewer", "worker"].map(agent);

describe("resolveAgent", () => {
  it("exact name match", () => {
    expect(resolveAgent(defaults, "scout")?.name).toBe("scout");
    expect(resolveAgent(defaults, "worker")?.name).toBe("worker");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveAgent(defaults, "Scout")?.name).toBe("scout");
    expect(resolveAgent(defaults, "WORKER")?.name).toBe("worker");
    expect(resolveAgent(defaults, "  planner  ")?.name).toBe("planner");
  });

  it("resolves the reported bug: explorer/explore -> scout", () => {
    expect(resolveAgent(defaults, "explorer")?.name).toBe("scout");
    expect(resolveAgent(defaults, "explore")?.name).toBe("scout");
    expect(resolveAgent(defaults, "Exploration")?.name).toBe("scout");
  });

  it("resolves other role synonyms to canonical agents", () => {
    expect(resolveAgent(defaults, "plan")?.name).toBe("planner");
    expect(resolveAgent(defaults, "review")?.name).toBe("reviewer");
    expect(resolveAgent(defaults, "code-reviewer")?.name).toBe("reviewer");
    expect(resolveAgent(defaults, "executor")?.name).toBe("worker");
    expect(resolveAgent(defaults, "general")?.name).toBe("worker");
  });

  it("only applies an alias when the canonical target is present", () => {
    const onlyPlanner = [agent("planner")];
    // "explorer" aliases to scout, but scout is not present -> no match
    expect(resolveAgent(onlyPlanner, "explorer")).toBeUndefined();
    expect(resolveAgent(onlyPlanner, "plan")?.name).toBe("planner");
  });

  it("does not override a user agent literally named like an alias", () => {
    const withExplorer = [...defaults, agent("explorer")];
    // exact match wins over the alias->scout mapping
    expect(resolveAgent(withExplorer, "explorer")?.name).toBe("explorer");
  });

  it("returns undefined for empty or unknown names", () => {
    expect(resolveAgent(defaults, "")).toBeUndefined();
    expect(resolveAgent(defaults, "   ")).toBeUndefined();
    expect(resolveAgent(defaults, "totally-unrelated")).toBeUndefined();
  });
});

describe("suggestAgent", () => {
  it("suggests the closest agent for a typo", () => {
    expect(suggestAgent(defaults, "scuot")).toBe("scout");
    expect(suggestAgent(defaults, "wokrer")).toBe("worker");
  });

  it("suggests via alias terms and substrings", () => {
    expect(suggestAgent(defaults, "explorerr")).toBe("scout");
    expect(suggestAgent(defaults, "rev")).toBe("reviewer");
  });

  it("returns undefined when nothing is close enough", () => {
    expect(suggestAgent(defaults, "qwertyuiop")).toBeUndefined();
  });

  it("returns undefined with no discovered agents", () => {
    expect(suggestAgent([], "scout")).toBeUndefined();
  });
});

describe("AGENT_ALIASES", () => {
  it("maps explorer/explore onto the scout agent", () => {
    expect(AGENT_ALIASES.scout).toContain("explorer");
    expect(AGENT_ALIASES.scout).toContain("explore");
  });
});
