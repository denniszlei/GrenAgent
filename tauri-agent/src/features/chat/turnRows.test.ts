import { describe, expect, it } from 'vitest';
import { buildTurnRows } from './turnRows';
import type { TimelineSegment } from './groupMessages';

const thinking = (id: string): TimelineSegment => ({ kind: 'thinking', id, content: 't', streaming: false });
const text = (id: string): TimelineSegment => ({ kind: 'text', id, content: 'x', streaming: false });
const tool = (id: string, toolName: string): TimelineSegment => ({
  kind: 'tool',
  id,
  toolCallId: `c-${id}`,
  toolName,
  args: {},
  result: {},
  status: 'done',
});

describe('buildTurnRows', () => {
  it('collapses 2+ consecutive read/list tools, keeps position', () => {
    const rows = buildTurnRows([
      thinking('th1'),
      tool('r1', 'read'),
      tool('r2', 'read_file'),
      tool('l1', 'ls'),
      text('tx1'),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['segment', 'context', 'segment']);
    const ctx = rows[1];
    if (ctx.kind !== 'context') throw new Error('expected context');
    expect(ctx.id).toBe('ctx-r1');
    expect(ctx.tools.map((t) => t.toolName)).toEqual(['read', 'read_file', 'ls']);
  });

  it('keeps a lone context tool as an individual row', () => {
    const rows = buildTurnRows([tool('r1', 'read'), tool('b1', 'bash')]);
    expect(rows.map((r) => r.kind)).toEqual(['segment', 'segment']);
    expect(rows.every((r) => r.kind === 'segment')).toBe(true);
  });

  it('never groups search/action tools (grep/glob/code_search stand alone)', () => {
    const rows = buildTurnRows([
      tool('g1', 'grep'),
      tool('g2', 'glob'),
      tool('c1', 'code_search'),
      tool('b1', 'bash'),
      tool('e1', 'edit'),
    ]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.kind === 'segment')).toBe(true);
  });

  it('search tools break a read run instead of merging into it', () => {
    const rows = buildTurnRows([
      tool('r1', 'read'),
      tool('r2', 'read'),
      tool('g1', 'grep'),
      tool('r3', 'read'),
      tool('r4', 'read'),
    ]);
    // read,read -> 折叠；grep 独立；read,read -> 折叠
    expect(rows.map((r) => r.kind)).toEqual(['context', 'segment', 'context']);
    const a = rows[0];
    const b = rows[2];
    if (a.kind !== 'context' || b.kind !== 'context') throw new Error('expected context groups');
    expect(a.tools.map((t) => t.id)).toEqual(['r1', 'r2']);
    expect(b.tools.map((t) => t.id)).toEqual(['r3', 'r4']);
    expect(rows[1].kind === 'segment' && rows[1].segment.kind === 'tool' && rows[1].segment.toolName).toBe('grep');
  });
});
