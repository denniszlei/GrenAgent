// Resolve an OpenAI-compatible endpoint (baseUrl + apiKey) for a capability
// (image / tts / embedding) from the provider library, via the ModelRegistry.
//
// baseUrl is taken from any model of the chosen provider (built-in providers
// carry built-in models; custom providers carry models.json baseUrl). apiKey is
// resolved through getApiKeyForProvider (auth.json + models.json). This reuses
// Phase-1 credentials and needs no duplicated default base-URL table.

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export interface CapabilityEndpoint {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type RegistryLike = Pick<ModelRegistry, "getAll" | "getApiKeyForProvider">;

export async function resolveCapabilityEndpoint(
  registry: RegistryLike,
  provider: string | undefined,
  model: string | undefined,
  fallbackModel: string,
): Promise<CapabilityEndpoint> {
  const p = (provider ?? "").trim();
  const baseUrl = (registry.getAll().find((m) => m.provider === p)?.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = p ? ((await registry.getApiKeyForProvider(p)) ?? "") : "";
  const resolved = (model ?? "").trim() || fallbackModel;
  return { enabled: apiKey.length > 0 && baseUrl.length > 0, baseUrl, apiKey, model: resolved };
}

/**
 * 候选 URL 列表，兜底用户填写的 Base URL 形状：
 * 先按填写的 base 直接拼 `{base}/{suffix}`；若 base 未带版本段（/v1、/v1beta、/v2…），
 * 再追加一个 `{base}/v1/{suffix}` 兜底候选。顺序对齐 Rust 的 fetch_provider_models
 *（先裸路径、再 /v1），覆盖"用户把 Base URL 写成不含版本段"这一最常见的 404 来源。
 */
export function buildCandidateUrls(baseUrl: string, suffix: string): string[] {
  const base = baseUrl.replace(/\/+$/, "");
  const s = suffix.replace(/^\/+/, "");
  const primary = `${base}/${s}`;
  if (/\/v\d+[a-z]*$/i.test(base)) return [primary];
  return [primary, `${base}/v1/${s}`];
}

/**
 * POST 到能力端点（embedding / tts / image），自动兜底 Base URL 形状：
 * 先试用户填的 base；仅当返回 404/405（路由不存在）且 base 未含版本段时，再试 `{base}/v1/...`。
 * 其它状态（鉴权 401/403、限流 429、参数 400…）是真实错误，直接返回首个响应交调用方处理，
 * 不做无谓重试。body 为 JSON 字符串可被多次发送，故同一 init 在候选间复用是安全的。
 */
export async function capabilityFetch(
  baseUrl: string,
  suffix: string,
  init: RequestInit,
): Promise<Response> {
  const urls = buildCandidateUrls(baseUrl, suffix);
  let res: Response | undefined;
  for (const url of urls) {
    res = await fetch(url, init);
    if (res.status !== 404 && res.status !== 405) break;
  }
  return res as Response;
}

function truncateBody(s: string): string {
  const t = s.trim();
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

/**
 * 统一的能力端点错误：附常见原因提示（404 多为该供应商不提供此能力 / Base URL 路径不对；
 * 401/403 为鉴权失败），便于用户自查，而非只甩一个状态码。
 */
export async function capabilityError(label: string, res: Response): Promise<Error> {
  const body = await res.text().catch(() => res.statusText);
  const hint =
    res.status === 404
      ? "（404：该供应商可能不提供此能力，或 Base URL 路径不对——通常应形如 https://host/v1）"
      : res.status === 401 || res.status === 403
        ? "（鉴权失败：请检查该供应商的 API Key）"
        : "";
  return new Error(`${label} ${res.status}: ${truncateBody(body)}${hint}`);
}
