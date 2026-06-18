import { describe, expect, it } from 'vitest';
import { parseCodeSearchHits, parseGlobOutput, parseGrepOutput } from './searchResults';

describe('parseGrepOutput', () => {
  it('parses grouped matches with total', () => {
    const text = [
      'Found 3 matches',
      '/proj/a.ts:',
      '  Line 12: const foo = 1',
      '  Line 30: foo()',
      '',
      '/proj/b.ts:',
      '  Line 5: import foo',
    ].join('\n');
    const r = parseGrepOutput(text);
    expect(r.total).toBe(3);
    expect(r.truncated).toBe(false);
    expect(r.files).toHaveLength(2);
    expect(r.files[0]).toEqual({
      path: '/proj/a.ts',
      matches: [
        { line: 12, text: 'const foo = 1' },
        { line: 30, text: 'foo()' },
      ],
    });
    expect(r.files[1].matches).toEqual([{ line: 5, text: 'import foo' }]);
  });

  it('handles windows paths and truncation note', () => {
    const text = [
      'Found 120 matches (showing first 100)',
      'C:\\proj\\x.ts:',
      '  Line 1: hit',
      '(Results truncated: showing 100 of 120 matches)',
    ].join('\n');
    const r = parseGrepOutput(text);
    expect(r.total).toBe(120);
    expect(r.truncated).toBe(true);
    expect(r.files[0].path).toBe('C:\\proj\\x.ts');
  });

  it('returns empty for No files found', () => {
    const r = parseGrepOutput('No files found');
    expect(r.total).toBe(0);
    expect(r.files).toHaveLength(0);
  });
});

describe('parseGlobOutput', () => {
  it('collects file paths and detects truncation', () => {
    const text = ['/proj/a.ts', '/proj/b.tsx', '', '(Results are truncated: showing first 100 results.)'].join('\n');
    const r = parseGlobOutput(text);
    expect(r.files).toEqual(['/proj/a.ts', '/proj/b.tsx']);
    expect(r.truncated).toBe(true);
  });

  it('returns empty for No files found', () => {
    expect(parseGlobOutput('No files found')).toEqual({ files: [], truncated: false });
  });
});

describe('parseCodeSearchHits', () => {
  it('prefers structured details.hits', () => {
    const result = {
      details: { hits: [{ file: '/p/a.ts', startLine: 1, endLine: 9, score: 0.91 }] },
      content: [{ type: 'text', text: 'ignored' }],
    };
    expect(parseCodeSearchHits(result)).toEqual([{ file: '/p/a.ts', startLine: 1, endLine: 9, score: 0.91 }]);
  });

  it('falls back to parsing text output', () => {
    const result = {
      content: [{ type: 'text', text: '2 result(s):\n1. /p/a.ts:3-20 (score 0.842)\n2. /p/b.ts:1-5 (score 0.700)' }],
    };
    const hits = parseCodeSearchHits(result);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ file: '/p/a.ts', startLine: 3, endLine: 20, score: 0.842 });
    expect(hits[1]).toEqual({ file: '/p/b.ts', startLine: 1, endLine: 5, score: 0.7 });
  });
});
