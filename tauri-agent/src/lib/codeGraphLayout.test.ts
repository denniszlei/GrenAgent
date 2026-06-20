import { describe, expect, it } from 'vitest';
import { computeForceLayout } from './codeGraphLayout';

describe('computeForceLayout', () => {
  it('returns a finite position for every node', () => {
    const graph = {
      nodes: [
        { path: 'a.ts', language: 'typescript', nodeCount: 3 },
        { path: 'b.ts', language: 'typescript', nodeCount: 2 },
        { path: 'c.ts', language: 'typescript', nodeCount: 1 },
      ],
      edges: [
        { source: 'a.ts', target: 'b.ts', weight: 2 },
        { source: 'b.ts', target: 'c.ts', weight: 1 },
      ],
    };
    const pos = computeForceLayout(graph, { iterations: 60 });
    expect(pos.size).toBe(3);
    for (const id of ['a.ts', 'b.ts', 'c.ts']) {
      const p = pos.get(id)!;
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('ignores edges that reference unknown nodes without throwing', () => {
    const graph = {
      nodes: [{ path: 'a.ts', language: '', nodeCount: 0 }],
      edges: [{ source: 'a.ts', target: 'ghost.ts', weight: 1 }],
    };
    const pos = computeForceLayout(graph, { iterations: 10 });
    expect(pos.size).toBe(1);
    expect(pos.has('a.ts')).toBe(true);
  });

  it('handles an empty graph', () => {
    const pos = computeForceLayout({ nodes: [], edges: [] }, { iterations: 5 });
    expect(pos.size).toBe(0);
  });
});
