import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getFileGraph } = vi.hoisted(() => ({ getFileGraph: vi.fn() }));
vi.mock('../../../../lib/codeGraphIo', () => ({ getFileGraph }));
vi.mock('../../../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
// reactflow 在 jsdom 需要 ResizeObserver/尺寸；mock 成桩，聚焦数据流与状态。
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="rf">{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}));

import { ThemeProvider } from '@lobehub/ui';
import { CodeGraphButton } from './CodeGraphPanel';

vi.setConfig({ testTimeout: 20000 });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton() {
  return render(
    <ThemeProvider>
      <CodeGraphButton />
    </ThemeProvider>,
  );
}

describe('CodeGraphButton', () => {
  it('renders the code-graph chip', () => {
    getFileGraph.mockResolvedValue({ nodes: [], edges: [] });
    renderButton();
    expect(screen.getByTestId('code-graph-button')).toBeTruthy();
  });

  it('opens the modal, loads the graph and shows stats', async () => {
    getFileGraph.mockResolvedValue({
      nodes: [
        { path: 'src/a.ts', language: 'typescript', nodeCount: 2 },
        { path: 'src/b.ts', language: 'typescript', nodeCount: 1 },
      ],
      edges: [{ source: 'src/a.ts', target: 'src/b.ts', weight: 3 }],
    });
    renderButton();
    fireEvent.click(screen.getByTestId('code-graph-button'));
    await waitFor(() => expect(getFileGraph).toHaveBeenCalledWith('/ws'));
    await waitFor(() =>
      expect(screen.getByTestId('code-graph-stats').textContent).toContain('2 个文件'),
    );
  });

  it('constrains the modal container to a viewport-bounded flex column (overflow fix)', async () => {
    getFileGraph.mockResolvedValue({ nodes: [], edges: [] });
    renderButton();
    fireEvent.click(screen.getByTestId('code-graph-button'));
    // antd v6 容器类名是 .ant-modal-container；全局样式必须命中它才不溢出。
    await waitFor(() => expect(document.querySelector('.ant-modal-container')).toBeTruthy());
    const container = document.querySelector('.ant-modal-container') as HTMLElement;
    const cs = getComputedStyle(container);
    expect(cs.display).toBe('flex');
    expect(cs.flexDirection).toBe('column');
    expect(cs.height).toContain('calc');
    // body 必须解除 antd 默认 max-height:75dvh，否则容器底部留白。
    const body = document.querySelector('.ant-modal-body') as HTMLElement;
    expect(getComputedStyle(body).maxHeight).toBe('none');
  });

  it('shows the backend error (e.g. no index) inside the modal', async () => {
    getFileGraph.mockRejectedValue(new Error('当前 workspace 尚未建立 CodeGraph 索引'));
    renderButton();
    fireEvent.click(screen.getByTestId('code-graph-button'));
    await waitFor(() =>
      expect(screen.getByTestId('code-graph-error').textContent).toContain('尚未建立'),
    );
  });
});
