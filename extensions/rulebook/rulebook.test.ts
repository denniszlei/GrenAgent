import { describe, expect, it } from "vitest";
import { argsMatch, globToRegExp, matchText, matchToolCall } from "./match.js";
import { type Rule, isValidRule, parseRules } from "./rules.js";

describe("globToRegExp", () => {
  it("matches with * and ?", () => {
    expect(globToRegExp("*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a.js")).toBe(false);
    expect(globToRegExp("a?c").test("abc")).toBe(true);
    expect(globToRegExp("a?c").test("ac")).toBe(false);
  });
});

describe("argsMatch", () => {
  it("matches arg fields against globs", () => {
    expect(argsMatch({ command: "*rm -rf*" }, { command: "sudo rm -rf /" })).toBe(true);
    expect(argsMatch({ command: "*rm -rf*" }, { command: "ls" })).toBe(false);
    expect(argsMatch(undefined, {})).toBe(true);
  });
});

describe("matchToolCall", () => {
  const tool: Rule = {
    id: "t",
    when: { kind: "tool", tool: "bash", argsMatch: { command: "*rm -rf*" } },
    action: "block",
    rule: "no",
  };
  const path: Rule = {
    id: "p",
    when: { kind: "path", tool: "edit", glob: "*.lock" },
    action: "block",
    rule: "no",
  };
  it("matches tool + args", () => {
    expect(matchToolCall(tool, "bash", { command: "rm -rf x" })).toBe(true);
    expect(matchToolCall(tool, "bash", { command: "ls" })).toBe(false);
    expect(matchToolCall(tool, "write", { command: "rm -rf x" })).toBe(false);
  });
  it("matches path on a specific tool", () => {
    expect(matchToolCall(path, "edit", { path: "yarn.lock" })).toBe(true);
    expect(matchToolCall(path, "edit", { path: "a.ts" })).toBe(false);
    expect(matchToolCall(path, "write", { path: "yarn.lock" })).toBe(false);
  });
});

describe("matchText", () => {
  const r: Rule = { id: "x", when: { kind: "text", pattern: "TODO|FIXME" }, action: "inject", rule: "no" };
  it("matches regex case-insensitively", () => {
    expect(matchText(r, "this is a todo")).toBe(true);
    expect(matchText(r, "all good")).toBe(false);
  });
});

describe("parseRules / isValidRule", () => {
  it("parses array and {rules:[]} with // comments", () => {
    expect(
      parseRules('// c\n[{"id":"a","when":{"kind":"tool","tool":"bash"},"action":"warn","rule":"r"}]'),
    ).toHaveLength(1);
    expect(
      parseRules('{"rules":[{"id":"a","when":{"kind":"text","pattern":"x"},"action":"inject","rule":"r"}]}'),
    ).toHaveLength(1);
  });
  it("drops invalid rules and bad json", () => {
    expect(parseRules('[{"id":"a"}]')).toHaveLength(0);
    expect(parseRules("not json")).toHaveLength(0);
    expect(isValidRule({ id: "a", when: { kind: "tool", tool: "x" }, action: "block", rule: "r" })).toBe(true);
    expect(isValidRule({ id: "a", when: { kind: "tool" }, action: "block", rule: "r" })).toBe(false);
    expect(isValidRule({ id: "a", when: { kind: "text", pattern: "x" }, action: "nope", rule: "r" })).toBe(false);
  });
});
