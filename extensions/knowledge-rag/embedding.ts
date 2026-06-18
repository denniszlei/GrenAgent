// Embedding backend for the knowledge-rag extension.
// Uses any OpenAI-compatible /embeddings endpoint. When no API key is
// configured the store transparently falls back to keyword search, so the
// extension always works out of the box.

import { getConfig } from "../_shared/runtime-config.js";
import {
  capabilityError,
  capabilityFetch,
  resolveCapabilityEndpoint,
  type RegistryLike,
} from "../_shared/provider-endpoint.js";

export interface EmbeddingConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function resolveEmbeddingConfig(registry: RegistryLike): Promise<EmbeddingConfig> {
  return resolveCapabilityEndpoint(registry, getConfig("KB_EMBED_PROVIDER"), getConfig("KB_EMBED_MODEL"), "text-embedding-3-small");
}

export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig,
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!config.enabled) throw new Error("embedding disabled: 请在设置-知识库选择 embedding 供应商");
  if (texts.length === 0) return [];

  const res = await capabilityFetch(config.baseUrl, "embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal,
  });

  if (!res.ok) throw await capabilityError("embedding API", res);

  const json = (await res.json()) as { data: Array<{ index?: number; embedding: number[] }> };
  if (json.data.length !== texts.length) {
    throw new Error(`embedding API 返回数量不符：期望 ${texts.length}，实际 ${json.data.length}`);
  }
  // 按 index 排序后再取向量：部分 OpenAI 兼容代理不保证 data 顺序与输入一致，
  // 乱序会导致向量与原文错位（召回结果错乱且极难排查）。index 缺省时保持原序（稳定排序）。
  return json.data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
}
