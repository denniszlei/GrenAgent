import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker.js";

describe("chunkText", () => {
  it("splits into line windows with 1-based line ranges", () => {
    const text = ["a", "b", "c", "d", "e"].join("\n");
    const chunks = chunkText(text, 2);
    expect(chunks).toEqual([
      { startLine: 1, endLine: 2, text: "a\nb" },
      { startLine: 3, endLine: 4, text: "c\nd" },
      { startLine: 5, endLine: 5, text: "e" },
    ]);
  });
  it("skips whitespace-only windows", () => {
    const chunks = chunkText("\n\n\nreal", 3);
    expect(chunks).toEqual([{ startLine: 4, endLine: 4, text: "real" }]);
  });
});
