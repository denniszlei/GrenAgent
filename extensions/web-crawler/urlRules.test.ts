import { describe, expect, it } from "vitest";
import { applyUrlRules } from "./urlRules.js";

describe("applyUrlRules", () => {
  it("rewrites github blob → raw and pins naive/jina", () => {
    const r = applyUrlRules("https://github.com/lobehub/lobe-chat/blob/main/README.md");
    expect(r.transformedUrl).toBe(
      "https://github.com/lobehub/lobe-chat/raw/refs/heads/main/README.md",
    );
    expect(r.impls).toEqual(["naive", "jina"]);
  });

  it("rewrites medium → scribe.rip", () => {
    expect(applyUrlRules("https://medium.com/foo/bar").transformedUrl).toBe(
      "https://scribe.rip/foo/bar",
    );
  });

  it("pins jina for arxiv/pdf", () => {
    expect(applyUrlRules("https://arxiv.org/pdf/2401.00001").impls).toEqual(["jina"]);
  });

  it("sets pureText for sports data tables", () => {
    expect(applyUrlRules("https://www.qiumiwu.com/standings/cba").pureText).toBe(true);
  });

  it("passes through unmatched URLs unchanged", () => {
    const r = applyUrlRules("https://example.com/page");
    expect(r.transformedUrl).toBe("https://example.com/page");
    expect(r.impls).toBeUndefined();
  });
});
