import { getDetails, extractText } from '../features/tools/toolUtils';

export interface GrepMatch {
  line: number;
  text: string;
}
export interface GrepFile {
  path: string;
  matches: GrepMatch[];
}
export interface GrepResult {
  total: number;
  truncated: boolean;
  files: GrepFile[];
}

/**
 * 解析内置 grep 工具的文本输出（opencode 格式，与 Pi 同源）：
 *   Found N matches[ (showing first 100)]
 *   <path>:
 *     Line 12: <text>
 *     Line 30: <text>
 *
 *   <path2>:
 *     Line 5: <text>
 *   (Results truncated: ...)         // 可选
 *   (Some paths were inaccessible)   // 可选
 */
export function parseGrepOutput(text: string): GrepResult {
  const files: GrepFile[] = [];
  let total = 0;
  let truncated = false;
  let current: GrepFile | null = null;

  for (const raw of text.split('\n')) {
    const found = raw.match(/^Found (\d+) matches?/);
    if (found) {
      total = Number(found[1]);
      if (/showing first/i.test(raw)) truncated = true;
      continue;
    }
    if (raw.startsWith('(')) {
      if (/truncated/i.test(raw)) truncated = true;
      continue;
    }
    const m = raw.match(/^\s+Line (\d+): ?(.*)$/);
    if (m) {
      if (current) current.matches.push({ line: Number(m[1]), text: m[2] });
      continue;
    }
    if (raw.endsWith(':') && raw.trim().length > 1 && !raw.startsWith(' ')) {
      current = { path: raw.slice(0, -1), matches: [] };
      files.push(current);
    }
  }

  // 文本没给「Found N」时（兜底）用实际命中行数。
  if (total === 0) total = files.reduce((n, f) => n + f.matches.length, 0);
  return { total, truncated, files };
}

export interface GlobResult {
  files: string[];
  truncated: boolean;
}

/** 解析 glob 工具输出：逐行文件路径（绝对路径），可能带 "No files found" 或截断提示。 */
export function parseGlobOutput(text: string): GlobResult {
  const files: string[] = [];
  let truncated = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('(')) {
      if (/truncated/i.test(line)) truncated = true;
      continue;
    }
    if (line === 'No files found') continue;
    files.push(line);
  }
  return { files, truncated };
}

export interface CodeSearchHit {
  file: string;
  startLine?: number;
  endLine?: number;
  score?: number;
}

/** 取 code_search 命中：优先结构化 details.hits，缺失时兜底解析文本 "1. file:start-end (score x)"。 */
export function parseCodeSearchHits(result: unknown): CodeSearchHit[] {
  const details = getDetails(result);
  const raw = details?.hits;
  if (Array.isArray(raw)) {
    return raw.flatMap((h): CodeSearchHit[] => {
      if (!h || typeof h !== 'object') return [];
      const o = h as Record<string, unknown>;
      const file = typeof o.file === 'string' ? o.file : '';
      if (!file) return [];
      return [
        {
          file,
          startLine: typeof o.startLine === 'number' ? o.startLine : undefined,
          endLine: typeof o.endLine === 'number' ? o.endLine : undefined,
          score: typeof o.score === 'number' ? o.score : undefined,
        },
      ];
    });
  }
  const hits: CodeSearchHit[] = [];
  for (const line of extractText(result).split('\n')) {
    const m = line.match(/^\s*\d+\.\s+(.+?):(\d+)-(\d+)(?:\s+\(score\s+([\d.]+)\))?/);
    if (m) {
      hits.push({
        file: m[1],
        startLine: Number(m[2]),
        endLine: Number(m[3]),
        score: m[4] ? Number(m[4]) : undefined,
      });
    }
  }
  return hits;
}
