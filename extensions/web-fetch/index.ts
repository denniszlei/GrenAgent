// web-fetch: let the agent fetch web pages over http(s) and read them as
// markdown. Uses the shared multi-provider crawler (naive + Jina Reader, plus
// Firecrawl/Exa/Search1API when their API keys are set) with per-site URL rules,
// so JS-heavy or bot-protected pages still come back as clean content.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isSafeUrl } from "./html.js";
import { getCrawler, type CrawlSuccessResult } from "../web-crawler/index.js";

const MAX_CHARS = Number(process.env.FETCH_MAX_CHARS ?? "20000") || 20000;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "fetch_url",
    label: "Fetch URL",
    description:
      "Fetch a web page over http(s) and return its main content as markdown. " +
      "Tries multiple crawl providers (naive, Jina Reader, and optionally Firecrawl/Exa/Search1API) " +
      "with per-site rules, so JS-heavy or bot-protected pages still come back readable. " +
      "Use it to read documentation, articles, API references, or release notes.",
    promptSnippet: "Fetch and read a web page (http/https) as markdown.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute http(s) URL" }),
      format: Type.Optional(Type.String({ description: "'markdown' (default) or 'text' (best-effort)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const safe = isSafeUrl(params.url);
      if (!safe.ok) throw new Error(`Refused to fetch: ${safe.reason}`);

      const result = await getCrawler().crawl({ url: params.url, signal: signal ?? undefined });
      const data = result.data;

      // All crawl providers failed → surface the error but don't throw.
      if (!("contentType" in data)) {
        return {
          content: [{ type: "text", text: data.content }],
          details: { url: params.url, crawler: result.crawler, error: data.errorMessage },
        };
      }

      const page = data as CrawlSuccessResult;
      let out = (page.title ? `# ${page.title}\n\n` : "") + (page.content ?? "");
      let truncated = false;
      if (out.length > MAX_CHARS) {
        out = out.slice(0, MAX_CHARS);
        truncated = true;
      }

      return {
        content: [{ type: "text", text: truncated ? `${out}\n\n[truncated to ${MAX_CHARS} chars]` : out }],
        details: {
          url: page.url,
          crawler: result.crawler,
          transformedUrl: result.transformedUrl,
          contentType: page.contentType,
          chars: out.length,
          truncated,
        },
      };
    },
  });
}
