// web-search: query a search engine (Tavily by default, Brave optional) and
// return an LLM-friendly summary + result links. Optionally fetch the body of
// the top N results as markdown (reusing web-fetch's html helpers).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isSafeUrl } from "../web-fetch/html.js";
import { getCrawler, type CrawlSuccessResult } from "../web-crawler/index.js";
import { formatResults, parseBrave, parseTavily, resolveProvider, type ParsedSearch, type SearchResult } from "./provider.js";

const TIMEOUT_MS = Number(process.env.WEB_SEARCH_TIMEOUT_MS ?? "15000") || 15000;
const FETCH_BODY_MAX = 4000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  outer: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (outer) outer.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tavilySearch(apiKey: string, query: string, maxResults: number, signal: AbortSignal | undefined) {
  const res = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults, include_answer: true }),
    },
    signal,
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<unknown>;
}

async function braveSearch(apiKey: string, query: string, maxResults: number, signal: AbortSignal | undefined) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { "X-Subscription-Token": apiKey, accept: "application/json", "accept-encoding": "gzip" } },
    signal,
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<unknown>;
}

async function fetchBodies(results: SearchResult[], signal: AbortSignal | undefined): Promise<string> {
  const parts: string[] = [];
  const crawler = getCrawler();
  for (const r of results) {
    if (!isSafeUrl(r.url).ok) continue;
    // Reuse the shared multi-provider crawler so JS-heavy / bot-protected result
    // pages still come back as clean content (naive → Jina → optional providers).
    const res = await crawler.crawl({ url: r.url, signal: signal ?? undefined });
    if (!("contentType" in res.data)) continue;
    let md = (res.data as CrawlSuccessResult).content ?? "";
    if (!md) continue;
    if (md.length > FETCH_BODY_MAX) md = `${md.slice(0, FETCH_BODY_MAX)}…`;
    parts.push(`## ${r.title || r.url}\n${r.url}\n\n${md}`);
  }
  return parts.join("\n\n---\n\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web (Tavily by default, or Brave) and return a short summary plus ranked result links. " +
      "Use it to find current information, documentation, or sources; then read a specific page with fetch_url.",
    promptSnippet: "Search the web; returns summary + result links.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      maxResults: Type.Optional(Type.Number({ description: "Max results (default 5, max 10)" })),
      fetchTop: Type.Optional(Type.Number({ description: "Also fetch the body of the top N results as markdown (default 0, max 3)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const choice = resolveProvider(process.env);
      if (!choice.ok) {
        return {
          content: [
            { type: "text", text: `web_search 不可用：${choice.reason}。请在设置里配置搜索 API Key，或改用 fetch_url 抓取已知 URL。` },
          ],
          details: { error: choice.reason },
        };
      }

      const query = params.query.trim();
      const maxResults = Math.max(1, Math.min(params.maxResults ?? 5, 10));

      let parsed: ParsedSearch;
      try {
        const raw =
          choice.provider === "brave"
            ? await braveSearch(choice.apiKey, query, maxResults, signal ?? undefined)
            : await tavilySearch(choice.apiKey, query, maxResults, signal ?? undefined);
        parsed = choice.provider === "brave" ? parseBrave(raw) : parseTavily(raw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `web_search 失败（${choice.provider}）：${msg}` }],
          details: { provider: choice.provider, query, error: msg },
        };
      }

      let text = formatResults(query, parsed);
      const fetchTop = Math.max(0, Math.min(params.fetchTop ?? 0, 3));
      if (fetchTop > 0 && parsed.results.length > 0) {
        const bodies = await fetchBodies(parsed.results.slice(0, fetchTop), signal ?? undefined);
        if (bodies) text += `\n\n---\n\n${bodies}`;
      }

      return {
        content: [{ type: "text", text }],
        details: { provider: choice.provider, query, count: parsed.results.length, results: parsed.results },
      };
    },
  });
}
