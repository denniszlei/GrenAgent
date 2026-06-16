import { describe, expect, it } from "vitest";
import { resolveEmbedding } from "./embedding.js";

describe("resolveEmbedding", () => {
  it("is disabled with no registry and keeps requested model", async () => {
    const c = await resolveEmbedding(undefined, "openai", "my-embed");
    expect(c.enabled).toBe(false);
    expect(c.model).toBe("my-embed");
  });
  it("falls back to default model when none given", async () => {
    const c = await resolveEmbedding(undefined, "openai", undefined);
    expect(c.model).toBe("text-embedding-3-small");
  });
});
