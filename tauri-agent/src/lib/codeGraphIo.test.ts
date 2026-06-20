import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { getFileGraph } from './codeGraphIo';

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ nodes: [], edges: [] });
});

describe('getFileGraph', () => {
  it('invokes code_intel_file_graph with workspace and null limit by default', async () => {
    await getFileGraph('/ws');
    expect(invoke).toHaveBeenCalledWith('code_intel_file_graph', { workspace: '/ws', limit: null });
  });

  it('passes an explicit limit through', async () => {
    await getFileGraph('/ws', 500);
    expect(invoke).toHaveBeenCalledWith('code_intel_file_graph', { workspace: '/ws', limit: 500 });
  });
});
