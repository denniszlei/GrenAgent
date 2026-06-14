// Per-site crawl rules (ported from lobehub web-crawler): rewrite the URL and/or
// pin which crawl impls to try for a given host. Pure + unit-testable (no network).

export interface CrawlUrlRule {
  /** Regex (as string) matched against the full URL. */
  urlPattern: string;
  /** Optional URL rewrite template; `$1`..`$n` reference regex capture groups. */
  urlTransform?: string;
  /** Pin the crawl impls (in order) for matching URLs. */
  impls?: string[];
  /** Force plain-text extraction (e.g. data tables) instead of markdown. */
  pureText?: boolean;
}

// Ordered: first matching rule wins. `browserless` from lobe is mapped to `jina`
// here since Pi does not ship a browserless impl.
export const crawlUrlRules: CrawlUrlRule[] = [
  { impls: ['search1api'], urlPattern: 'https://sogou.com/link(.*)' },
  { impls: ['search1api'], urlPattern: 'https://www.youtube.com/watch(.*)' },
  { impls: ['search1api'], urlPattern: 'https://www.reddit.com/r/(.*)/comments/(.*)' },
  // GitHub blob -> raw, read as plain (no readability needed).
  {
    impls: ['naive', 'jina'],
    urlPattern: 'https://github.com/([^/]+)/([^/]+)/blob/([^/]+)/(.*)',
    urlTransform: 'https://github.com/$1/$2/raw/refs/heads/$3/$4',
  },
  { impls: ['naive', 'jina'], urlPattern: 'https://github.com/(.*)/discussions/(.*)' },
  // PDFs / arxiv -> jina reader.
  { impls: ['jina'], urlPattern: 'https://(.*).pdf' },
  { impls: ['jina'], urlPattern: 'https://arxiv.org/pdf/(.*)' },
  // Medium -> scribe.rip mirror.
  { urlPattern: 'https://medium.com/(.*)', urlTransform: 'https://scribe.rip/$1' },
  // Twitter/X -> jina (lobe also tries browserless; mapped to jina here).
  { impls: ['jina'], urlPattern: 'https://(twitter.com|x.com)/(.*)' },
  // Sports tables -> naive plain text.
  { impls: ['naive'], pureText: true, urlPattern: 'https://www.qiumiwu.com/standings/(.*)' },
  { impls: ['jina'], urlPattern: 'https://developer.mozilla.org(.*)' },
  { impls: ['jina'], urlPattern: 'https://cvpr.thecvf.com(.*)' },
  { impls: ['jina'], urlPattern: 'https://(.*).feishu.cn/(.*)' },
  { impls: ['search1api', 'jina'], urlPattern: 'https://(.*).xiaohongshu.com/(.*)' },
];

export interface AppliedUrlRule {
  transformedUrl: string;
  impls?: string[];
  pureText?: boolean;
}

/** Find the first matching rule, apply its URL transform, and surface its impls/pureText. */
export function applyUrlRules(url: string, rules: CrawlUrlRule[] = crawlUrlRules): AppliedUrlRule {
  for (const rule of rules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.urlPattern);
    } catch {
      continue;
    }
    const m = url.match(re);
    if (!m) continue;

    const transformedUrl = rule.urlTransform
      ? rule.urlTransform.replace(/\$(\d+)/g, (_s, n: string) => m[Number(n)] ?? '')
      : url;

    return { transformedUrl, impls: rule.impls, pureText: rule.pureText };
  }
  return { transformedUrl: url };
}
