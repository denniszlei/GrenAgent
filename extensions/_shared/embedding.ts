// Shared embedding client: resolve an OpenAI-compatible embeddings endpoint via
// the provider library and embed a batch of texts. Parameterized over the
// provider/model so each extension passes its own config keys.

import { capabilityError, capabilityFetch, type RegistryLike, resolveCapabilityEndpoint } from "./provider-endpoint.js";

export interface EmbeddingConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveEmbedding(
  registry: RegistryLike | undefined,
  provider: string | undefined,
  model: string | undefined,
  fallbackModel = "text-embedding-3-small",
): Promise<EmbeddingConfig> {
  if (!registry) {
    return Promise.resolve({ enabled: false, baseUrl: "", apiKey: "", model: (model ?? "").trim() || fallbackModel });
  }
  return resolveCapabilityEndpoint(registry, provider, model, fallbackModel);
}

export async function embedTexts(texts: string[], config: EmbeddingConfig, signal?: AbortSignal): Promise<number[][]> {
  if (!config.enabled) throw new Error("embedding disabled: configure an embedding provider in settings");
  if (texts.length === 0) return [];
  const res = await capabilityFetch(config.baseUrl, "embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal,
  });
  if (!res.ok) throw await capabilityError("embedding API", res);
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}
