import { describe, expect, it } from "vitest";
import { PRESETS, resolveProfile, profileToModel, profileToEnv } from "./capability.js";

describe("resolveProfile", () => {
  it("undefined → default preset", () => {
    expect(resolveProfile(undefined).fs).toBe("workspace");
    expect(resolveProfile(undefined).isolation).toBe("process");
  });
  it("preset name → that preset", () => {
    expect(resolveProfile("explore").fs).toBe("readonly");
    expect(resolveProfile("explore").model).toBe("cheap");
  });
  it("unknown name → falls back to default", () => {
    expect(resolveProfile("nope").fs).toBe("workspace");
  });
  it("extends preset + inline override (additive)", () => {
    const p = resolveProfile({ extends: "explore", fs: { writeAllow: ["notes/"] } });
    expect(p.fs).toEqual({ writeAllow: ["notes/"] }); // overridden
    expect(p.net).toBe(true); // inherited from explore
    expect(p.model).toBe("cheap"); // inherited from explore
  });
  it("pure inline merges onto default base", () => {
    const p = resolveProfile({ fs: "readonly", net: false });
    expect(p.fs).toBe("readonly");
    expect(p.net).toBe(false);
    expect(p.isolation).toBe("process"); // from default base
    expect(p.spawn).toBe(false); // from default base
  });
  it("inline tools deny is carried through", () => {
    expect(resolveProfile({ tools: { deny: ["bash"] } }).tools).toEqual({ deny: ["bash"] });
  });
  it("every preset is self-consistent (process isolation by default in P0)", () => {
    for (const name of Object.keys(PRESETS)) {
      expect(["process", "worktree", "sandbox"]).toContain(PRESETS[name].isolation);
    }
  });
});

describe("profileToModel", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  it("cheap → SUBAGENT_MODEL_CHEAP", () => {
    expect(profileToModel({ model: "cheap" }, env({ SUBAGENT_MODEL_CHEAP: "deepseek/deepseek-chat" }))).toBe(
      "deepseek/deepseek-chat",
    );
  });
  it("cheap falls back to SUBAGENT_MODEL when no _CHEAP", () => {
    expect(profileToModel({ model: "cheap" }, env({ SUBAGENT_MODEL: "foo/bar" }))).toBe("foo/bar");
  });
  it("strong → SUBAGENT_MODEL_STRONG", () => {
    expect(profileToModel({ model: "strong" }, env({ SUBAGENT_MODEL_STRONG: "openai/o3" }))).toBe("openai/o3");
  });
  it("literal provider/id passes through", () => {
    expect(profileToModel({ model: "openai/gpt-4o" }, env({}))).toBe("openai/gpt-4o");
  });
  it("no model → undefined", () => {
    expect(profileToModel({}, env({}))).toBeUndefined();
  });
});

describe("profileToEnv", () => {
  it("fs=readonly → SAFETY_READONLY + empty allowlist", () => {
    const e = profileToEnv({ fs: "readonly" });
    expect(e.SAFETY_READONLY).toBe("1");
    expect(e.SAFETY_WRITE_ALLOW).toBe("");
    expect(e.MCP_SERVERS).toBe("");
  });
  it("fs writeAllow → readonly + joined prefixes", () => {
    const e = profileToEnv({ fs: { writeAllow: ["plans/", "docs/"] } });
    expect(e.SAFETY_READONLY).toBe("1");
    expect(e.SAFETY_WRITE_ALLOW).toBe("plans/,docs/");
  });
  it("fs=workspace → no SAFETY_READONLY", () => {
    expect(profileToEnv({ fs: "workspace" }).SAFETY_READONLY).toBeUndefined();
  });
  it("net=false → deny web tools", () => {
    expect(profileToEnv({ net: false }).SAFETY_DENY_TOOLS).toBe("web_search,web_fetch,web_crawler");
  });
  it("mcp allowlist → MCP_SERVERS", () => {
    expect(profileToEnv({ mcp: ["github"] }).MCP_SERVERS).toBe("github");
  });
  it("tools.deny merges into deny list", () => {
    expect(profileToEnv({ net: false, tools: { deny: ["bash"] } }).SAFETY_DENY_TOOLS).toBe(
      "web_search,web_fetch,web_crawler,bash",
    );
  });
});
