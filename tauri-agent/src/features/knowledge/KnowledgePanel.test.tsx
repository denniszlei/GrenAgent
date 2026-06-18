import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { kbStats, kbSources, kbChunks, runCommand, openDialog } = vi.hoisted(() => ({
  kbStats: vi.fn(() => Promise.resolve({ chunks: 3, sources: 2, model: 'text-embed' })),
  kbSources: vi.fn(() =>
    Promise.resolve([
      { source: 'a.md', chunks: 2 },
      { source: 'b.md', chunks: 1 },
    ]),
  ),
  kbChunks: vi.fn(() => Promise.resolve([{ id: 'c1', text: 'hello chunk' }])),
  runCommand: vi.fn(() => Promise.resolve()),
  openDialog: vi.fn(),
}));

vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
vi.mock('../../lib/pi', () => ({ pi: { kbStats, kbSources, kbChunks, runCommand } }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openDialog }));

import { KnowledgePanel, toWorkspacePath } from './KnowledgePanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KnowledgePanel', () => {
  it('shows stats and source list', async () => {
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-header').textContent).toContain('3'));
    expect(screen.getByTestId('kb-header').textContent).toContain('2');
    expect(screen.getByTestId('kb-source-a.md')).toBeTruthy();
    expect(screen.getByTestId('kb-source-b.md')).toBeTruthy();
  });

  it('loads chunks when a source is clicked', async () => {
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-source-a.md')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kb-source-a.md'));
    await waitFor(() => expect(kbChunks).toHaveBeenCalledWith('/ws', 'a.md'));
    await waitFor(() => expect(screen.getByTestId('kb-detail').textContent).toContain('hello chunk'));
  });

  it('clears the knowledge base via /kb clear', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-source-a.md')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kb-clear'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/kb clear'));
  });

  it('adds a picked file via /kb add, relativized to the workspace', async () => {
    openDialog.mockResolvedValueOnce('/ws/docs/new.md');
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-add')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kb-add'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/kb add docs/new.md'));
  });

  it('indexes every file when multiple are picked', async () => {
    openDialog.mockResolvedValueOnce(['/ws/a.md', '/outside/b.md']);
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-add')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kb-add'));
    await waitFor(() => expect(runCommand).toHaveBeenCalledWith('/ws', '/kb add a.md'));
    expect(runCommand).toHaveBeenCalledWith('/ws', '/kb add /outside/b.md');
  });

  it('does nothing when the picker is cancelled', async () => {
    openDialog.mockResolvedValueOnce(null);
    render(<KnowledgePanel />);
    await waitFor(() => expect(screen.getByTestId('kb-add')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kb-add'));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(runCommand).not.toHaveBeenCalled();
  });
});

describe('toWorkspacePath', () => {
  it('relativizes paths inside the workspace and normalizes separators', () => {
    expect(toWorkspacePath('D:\\proj\\docs\\a.md', 'D:\\proj')).toBe('docs/a.md');
    expect(toWorkspacePath('/ws/docs/a.md', '/ws')).toBe('docs/a.md');
  });

  it('keeps absolute paths that live outside the workspace', () => {
    expect(toWorkspacePath('/other/a.md', '/ws')).toBe('/other/a.md');
  });
});
