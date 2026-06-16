import { describe, expect, it } from "vitest";
import { parseJsonLoose, resolveModel } from "./llm.js";

describe("parseJsonLoose", () => {
  it("parses plain json", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses fenced json with trailing prose", () => {
    expect(parseJsonLoose('```json\n{"v":"ok"}\n```\nthanks')).toEqual({ v: "ok" });
  });
  it("returns undefined on garbage", () => {
    expect(parseJsonLoose("no json here")).toBeUndefined();
  });
});

describe("resolveModel", () => {
  const reg = { find: (p: string, id: string) => (p === "x" && id === "y" ? ({ id: "found" } as never) : undefined) };
  it("resolves provider/id override via registry", () => {
    expect(resolveModel(undefined, reg, "x/y")).toEqual({ id: "found" });
  });
  it("falls back to current when no override", () => {
    expect(resolveModel({ id: "cur" } as never, reg, undefined)).toEqual({ id: "cur" });
  });
  it("falls back to current when override not found", () => {
    expect(resolveModel({ id: "cur" } as never, reg, "nope/missing")).toEqual({ id: "cur" });
  });
});
