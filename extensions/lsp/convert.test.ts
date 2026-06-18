import { describe, expect, it } from "vitest";
import { normalizeLocations, pathToUri, toLspPosition, uriToPath } from "./convert.js";

describe("toLspPosition", () => {
  it("converts 1-based to 0-based, clamped at 0", () => {
    expect(toLspPosition(1, 1)).toEqual({ line: 0, character: 0 });
    expect(toLspPosition(5, 3)).toEqual({ line: 4, character: 2 });
    expect(toLspPosition(0, 0)).toEqual({ line: 0, character: 0 });
  });
});

describe("uri round trip", () => {
  it("path → uri → path", () => {
    const p = process.platform === "win32" ? "C:\\a\\b.ts" : "/a/b.ts";
    expect(uriToPath(pathToUri(p))).toBe(p);
  });
});

describe("normalizeLocations", () => {
  const uri = pathToUri(process.platform === "win32" ? "C:\\x.ts" : "/x.ts");
  const range = { start: { line: 2, character: 4 }, end: { line: 2, character: 8 } };

  it("handles a single Location, an array, and a LocationLink", () => {
    expect(normalizeLocations({ uri, range })[0]).toMatchObject({ line: 3, column: 5 });
    expect(normalizeLocations([{ uri, range }])).toHaveLength(1);
    expect(normalizeLocations([{ targetUri: uri, targetRange: range }])[0]).toMatchObject({
      line: 3,
      column: 5,
    });
  });
  it("returns [] for null/empty", () => {
    expect(normalizeLocations(null)).toEqual([]);
    expect(normalizeLocations([])).toEqual([]);
  });
});
