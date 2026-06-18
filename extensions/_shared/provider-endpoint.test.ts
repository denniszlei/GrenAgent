import { describe, expect, it } from "vitest";
import { buildCandidateUrls, resolveCapabilityEndpoint, type RegistryLike } from "./provider-endpoint.js";

const reg = (key: string | undefined): RegistryLike =>
  ({
    getAll: () => [{ provider: "openai", baseUrl: "https://api.openai.com/v1/" }] as never,
    getApiKeyForProvider: async (p: string) => (p === "openai" ? key : undefined),
  }) as RegistryLike;

describe("resolveCapabilityEndpoint", () => {
  it("resolves baseUrl+key, strips trailing slash, applies fallback model", async () => {
    const ep = await resolveCapabilityEndpoint(reg("sk-x"), "openai", "", "text-embedding-3-small");
    expect(ep).toEqual({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-x",
      model: "text-embedding-3-small",
    });
  });

  it("keeps explicit model over fallback", async () => {
    const ep = await resolveCapabilityEndpoint(reg("sk-x"), "openai", "dall-e-3", "gpt-image-1");
    expect(ep.model).toBe("dall-e-3");
  });

  it("disabled when no key", async () => {
    const ep = await resolveCapabilityEndpoint(reg(undefined), "openai", "m", "fb");
    expect(ep.enabled).toBe(false);
  });

  it("disabled when provider unknown (no baseUrl)", async () => {
    const ep = await resolveCapabilityEndpoint(reg("k"), "nope", "m", "fb");
    expect(ep.enabled).toBe(false);
    expect(ep.baseUrl).toBe("");
  });

  it("disabled when provider empty", async () => {
    const ep = await resolveCapabilityEndpoint(reg("k"), "", "m", "fb");
    expect(ep.enabled).toBe(false);
  });
});

describe("buildCandidateUrls", () => {
  it("adds a /v1 fallback when base has no version segment", () => {
    expect(buildCandidateUrls("https://host", "embeddings")).toEqual([
      "https://host/embeddings",
      "https://host/v1/embeddings",
    ]);
  });

  it("does not add /v1 when base already ends with a version segment", () => {
    expect(buildCandidateUrls("https://host/v1", "embeddings")).toEqual(["https://host/v1/embeddings"]);
    expect(buildCandidateUrls("https://host/v1beta", "audio/speech")).toEqual([
      "https://host/v1beta/audio/speech",
    ]);
  });

  it("normalizes trailing/leading slashes", () => {
    expect(buildCandidateUrls("https://host/", "/embeddings")).toEqual([
      "https://host/embeddings",
      "https://host/v1/embeddings",
    ]);
  });
});
