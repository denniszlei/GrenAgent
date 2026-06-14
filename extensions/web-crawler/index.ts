// web-crawler: multi-provider page crawler (ported from lobehub) shared by the
// fetch_url and web_search tools. naive + jina are keyless; firecrawl / exa /
// search1api activate when their API key is set.

export { availableImpls, Crawler, getCrawler } from "./crawler.js";
export type { CrawlErrorResult, CrawlSuccessResult, CrawlUniformResult } from "./crawler.js";
export { applyUrlRules, crawlUrlRules } from "./urlRules.js";
export type { CrawlUrlRule } from "./urlRules.js";
