import { afterEach, describe, expect, it } from "vitest";
import { extractFinalText, resolvePiCommand } from "./runner.js";

const orig = process.env.PI_BIN;
afterEach(() => {
  if (orig === undefined) delete process.env.PI_BIN;
  else process.env.PI_BIN = orig;
});

describe("resolvePiCommand", () => {
  it("prefers PI_BIN when set", () => {
    process.env.PI_BIN = "/custom/pi";
    expect(resolvePiCommand().cmd).toBe("/custom/pi");
  });
  it("falls back to the current executable (sidecar self), not bare 'pi'", () => {
    delete process.env.PI_BIN;
    expect(resolvePiCommand().cmd).toBe(process.execPath);
  });
});

describe("extractFinalText", () => {
  it("returns the last assistant text from JSONL", () => {
    const jsonl = [
      JSON.stringify({ role: "assistant", content: "first" }),
      JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "final answer" }] } }),
    ].join("\n");
    expect(extractFinalText(jsonl)).toBe("final answer");
  });
  it("falls back to a tail slice when no assistant message is present", () => {
    expect(extractFinalText("not json at all")).toBe("not json at all");
  });
});
