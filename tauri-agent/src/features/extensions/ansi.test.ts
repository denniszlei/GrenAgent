import { describe, expect, it } from 'vitest';
import { parseAnsi, parseCodegraphStatus, stripAnsi } from './ansi';

const ESC = '\u001b';

// A realistic `codegraph status` payload, complete with the SGR codes the CLI
// emits over a pipe (bold headers, cyan field labels, reset).
const SAMPLE = [
  `${ESC}[1mCodeGraph Status${ESC}[0m`,
  `  ${ESC}[36mProject:${ESC}[0m D:/System Dir/Downloads/lobehub`,
  '',
  `  ${ESC}[1mIndex Statistics:${ESC}[0m`,
  '    Files:    62',
  '    Nodes:    506',
  '    Edges:    440',
  '    DB Size:  4.31 MB',
  '    Backend:  mode:sqlite - built-in (full WAL)',
  '    Journal:  wal',
].join('\n');

describe('stripAnsi', () => {
  it('removes SGR escape sequences but keeps the text', () => {
    expect(stripAnsi(`${ESC}[1m${ESC}[36mHello${ESC}[0m world`)).toBe('Hello world');
  });

  it('drops non-colour CSI sequences (cursor moves, clears)', () => {
    expect(stripAnsi(`a${ESC}[2Kb${ESC}[1;1Hc`)).toBe('abc');
  });

  it('is a no-op on plain text', () => {
    expect(stripAnsi('just text\nline two')).toBe('just text\nline two');
  });
});

describe('parseAnsi', () => {
  it('returns a single unstyled segment for plain text', () => {
    expect(parseAnsi('plain')).toEqual([{ text: 'plain', bold: false, dim: false, color: undefined }]);
  });

  it('tracks bold + colour and resets them', () => {
    const segs = parseAnsi(`${ESC}[1m${ESC}[31mERR${ESC}[0m ok`);
    const err = segs.find((s) => s.text === 'ERR');
    expect(err?.bold).toBe(true);
    expect(err?.color).toBe('#e06c75');
    const ok = segs.find((s) => s.text === ' ok');
    expect(ok?.bold).toBe(false);
    expect(ok?.color).toBeUndefined();
  });

  it('reassembles to the stripped text', () => {
    expect(
      parseAnsi(SAMPLE)
        .map((s) => s.text)
        .join(''),
    ).toBe(stripAnsi(SAMPLE));
  });
});

describe('parseCodegraphStatus', () => {
  it('extracts headline metrics from a real status payload', () => {
    const r = parseCodegraphStatus(SAMPLE);
    expect(r.indexed).toBe(true);
    expect(r.stats).toEqual([
      { label: 'Files', value: '62' },
      { label: 'Nodes', value: '506' },
      { label: 'Edges', value: '440' },
      { label: 'DB Size', value: '4.31 MB' },
    ]);
    expect(r.project).toBe('D:/System Dir/Downloads/lobehub');
    expect(r.details).toContainEqual({ label: 'Backend', value: 'mode:sqlite - built-in (full WAL)' });
    expect(r.details).toContainEqual({ label: 'Journal', value: 'wal' });
  });

  it('handles thousands separators in counts', () => {
    const r = parseCodegraphStatus('Files: 1,234\nNodes: 56,789\nEdges: 9,000');
    expect(r.stats).toContainEqual({ label: 'Files', value: '1,234' });
    expect(r.stats).toContainEqual({ label: 'Nodes', value: '56,789' });
  });

  it('degrades gracefully for error / un-indexed output', () => {
    const r = parseCodegraphStatus('codegraph ["status"] exited (1): not initialized');
    expect(r.indexed).toBe(false);
    expect(r.stats).toEqual([]);
  });
});
