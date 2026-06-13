import { afterEach, describe, expect, it } from "vitest";
import { parseExtracted, resolvePiCommand } from "./extractor.js";

const orig = process.env.PI_BIN;
afterEach(() => {
  if (orig === undefined) delete process.env.PI_BIN;
  else process.env.PI_BIN = orig;
});

describe("resolvePiCommand", () => {
  it("prefers PI_BIN when set", () => {
    process.env.PI_BIN = "/custom/pi";
    expect(resolvePiCommand()).toBe("/custom/pi");
  });
  it("falls back to the current executable (sidecar self), not bare 'pi'", () => {
    delete process.env.PI_BIN;
    expect(resolvePiCommand()).toBe(process.execPath);
  });
});

describe("parseExtracted", () => {
  it("strips numbering/bullets and filters out too-short lines", () => {
    const out = "1. User prefers tabs over spaces\n- Likes dark mode\n  \nx\n";
    expect(parseExtracted(out)).toEqual(["User prefers tabs over spaces", "Likes dark mode"]);
  });
});
