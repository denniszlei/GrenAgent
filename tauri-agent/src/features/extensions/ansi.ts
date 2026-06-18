// Lightweight ANSI/SGR parsing for the Code Intelligence panel.
//
// codegraph's CLI emits ANSI colour codes (\x1b[..m) even when its stdout is a
// pipe (non-TTY), so the raw `status` text returned over the Tauri command
// arrives sprinkled with escape sequences. Rendered as-is they show up as
// garbage like "[1m" / "[36m" / "[0m" (the ESC byte itself is invisible).
//
// We parse those sequences into styled segments so the log can be rendered like
// a real terminal, and additionally pull the key index metrics out of the
// stripped text to drive the stat cards.

export interface AnsiSegment {
  text: string;
  bold: boolean;
  dim: boolean;
  /** Resolved foreground colour (terminal-dark palette) or undefined for default. */
  color?: string;
}

// One Dark-flavoured 16-colour palette, tuned to read well on a dark terminal
// background. Index = SGR foreground code (30-37 normal, 90-97 bright).
const FG: Record<number, string> = {
  30: '#5c6370',
  31: '#e06c75',
  32: '#98c379',
  33: '#e5c07b',
  34: '#61afef',
  35: '#c678dd',
  36: '#56b6c2',
  37: '#abb2bf',
  90: '#636d83',
  91: '#ff8088',
  92: '#a9e08e',
  93: '#f0d08a',
  94: '#73b8ff',
  95: '#d790e8',
  96: '#66c7d2',
  97: '#ffffff',
};

const ESC = 27;

/** Parse a string with ANSI SGR codes into a flat list of styled segments. */
export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let buf = '';
  let bold = false;
  let dim = false;
  let color: string | undefined;

  const flush = () => {
    if (buf) segments.push({ text: buf, bold, dim, color });
    buf = '';
  };

  let i = 0;
  while (i < input.length) {
    const code = input.charCodeAt(i);
    // CSI sequence: ESC [ ... <final-letter>
    if (code === ESC && input[i + 1] === '[') {
      let j = i + 2;
      while (j < input.length && !/[A-Za-z]/.test(input[j])) j += 1;
      const final = input[j];
      if (final === 'm') {
        flush();
        const params = input.slice(i + 2, j);
        const codes = params === '' ? [0] : params.split(';').map((p) => Number.parseInt(p, 10));
        for (const c of codes) {
          if (c === 0) {
            bold = false;
            dim = false;
            color = undefined;
          } else if (c === 1) bold = true;
          else if (c === 2) dim = true;
          else if (c === 22) {
            bold = false;
            dim = false;
          } else if (c === 39) color = undefined;
          else if (FG[c]) color = FG[c];
        }
      }
      // Skip the whole CSI sequence (colour or otherwise: cursor moves, clears…).
      i = j + 1;
      continue;
    }
    // Drop any stray ESC byte that isn't a CSI introducer.
    if (code === ESC) {
      i += 1;
      continue;
    }
    buf += input[i];
    i += 1;
  }
  flush();
  return segments;
}

/** Strip all ANSI escape sequences, leaving clean plain text. */
export function stripAnsi(input: string): string {
  return parseAnsi(input)
    .map((s) => s.text)
    .join('');
}

export interface CodeGraphStat {
  label: string;
  value: string;
}

export interface CodeGraphStatus {
  /** Headline numeric metrics for the stat-card grid. */
  stats: CodeGraphStat[];
  /** Secondary key/value details (backend, journal…). */
  details: CodeGraphStat[];
  project?: string;
  /** True when we could parse real index metrics (i.e. an indexed workspace). */
  indexed: boolean;
}

/**
 * Best-effort parse of `codegraph status` output into structured metrics.
 * Resilient to ANSI codes and missing fields; returns an empty/indexed=false
 * result for error strings or un-indexed workspaces so callers can fall back to
 * rendering the raw log.
 */
export function parseCodegraphStatus(raw: string): CodeGraphStatus {
  const clean = stripAnsi(raw);
  const grab = (re: RegExp): string | undefined => clean.match(re)?.[1]?.trim();
  const count = (label: string) => grab(new RegExp(`${label}\\s*:?\\s*([\\d,]+)\\b`, 'i'));

  const stats: CodeGraphStat[] = [];
  const files = count('Files');
  const nodes = count('Nodes');
  const edges = count('Edges');
  const dbSize = grab(/DB\s*Size\s*:?\s*([\d.]+\s*[KMGTP]?i?B)/i);
  if (files) stats.push({ label: 'Files', value: files });
  if (nodes) stats.push({ label: 'Nodes', value: nodes });
  if (edges) stats.push({ label: 'Edges', value: edges });
  if (dbSize) stats.push({ label: 'DB Size', value: dbSize });

  const details: CodeGraphStat[] = [];
  const backend = grab(/Backend\s*:?\s*([^\n]+)/i);
  const journal = grab(/Journal\s*:?\s*([^\n]+)/i);
  if (backend) details.push({ label: 'Backend', value: backend });
  if (journal) details.push({ label: 'Journal', value: journal });

  return {
    stats,
    details,
    project: grab(/Project\s*:?\s*([^\n]+)/i),
    indexed: stats.length > 0,
  };
}
