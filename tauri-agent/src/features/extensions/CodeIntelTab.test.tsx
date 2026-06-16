import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { codeIntelStatus, codeIntelInit, codeIntelSync, codeIntelReindex } = vi.hoisted(() => ({
  codeIntelStatus: vi.fn(() => Promise.resolve('Files: 10\nNodes: 99')),
  codeIntelInit: vi.fn(() => Promise.resolve('initialized')),
  codeIntelSync: vi.fn(() => Promise.resolve('synced')),
  codeIntelReindex: vi.fn(() => Promise.resolve('rebuilt')),
}));
vi.mock('../../lib/codeIntelIo', () => ({
  codeIntelStatus,
  codeIntelInit,
  codeIntelSync,
  codeIntelReindex,
  codeIntelIsInitialized: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
// ModelSelectField 依赖 provider 数据；mock 成一个最小输入桩，聚焦本组件逻辑。
vi.mock('../settings/ModelSelectField', () => ({
  ModelSelectField: ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) => (
    <input data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ThemeProvider } from '@lobehub/ui';
import { CodeIntelTab } from './CodeIntelTab';

vi.setConfig({ testTimeout: 20000 });
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderTab(values: Record<string, string> = {}) {
  const setValue = vi.fn();
  const onChange = vi.fn();
  const { container } = render(
    <ThemeProvider>
      <CodeIntelTab values={values} setValue={setValue} onChange={onChange} knownToolNames={[]} />
    </ThemeProvider>,
  );
  return { setValue, onChange, container };
}

describe('CodeIntelTab', () => {
  it('loads index status on mount', async () => {
    renderTab();
    await waitFor(() => expect(codeIntelStatus).toHaveBeenCalledWith('/ws'));
    await waitFor(() => expect(screen.getByTestId('code-intel-status').textContent).toContain('Nodes: 99'));
  });

  it('runs init and refreshes status', async () => {
    renderTab();
    await waitFor(() => expect(codeIntelStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('code-intel-init'));
    await waitFor(() => expect(codeIntelInit).toHaveBeenCalledWith('/ws'));
  });

  it('changing engine writes CODE_INTEL and marks changed', async () => {
    const { setValue, onChange, container } = renderTab({ CODE_INTEL: 'codegraph' });
    await waitFor(() => expect(codeIntelStatus).toHaveBeenCalled());
    // antd Select：打开下拉后选「关闭」。下拉项渲染在 portal；用模糊 class 兼容任意 prefixCls。
    const selector =
      container.querySelector('[class*="select-selector"]') ?? container.querySelector('[role="combobox"]');
    expect(selector).toBeTruthy();
    fireEvent.mouseDown(selector!);
    await waitFor(() => expect(screen.getByText('关闭')).toBeTruthy());
    fireEvent.click(screen.getByText('关闭'));
    expect(setValue).toHaveBeenCalledWith('CODE_INTEL', 'off');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the yield badge when a user codegraph tool is present', async () => {
    render(
      <ThemeProvider>
        <CodeIntelTab values={{}} setValue={vi.fn()} onChange={vi.fn()} knownToolNames={['codegraph_explore']} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(codeIntelStatus).toHaveBeenCalled());
    expect(screen.getByTestId('code-intel-badge').textContent).toContain('让位');
  });

  it('toggles the explorer switch (writes CODE_INTEL_EXPLORER)', async () => {
    const { setValue } = renderTab({ CODE_INTEL_EXPLORER: '1' });
    await waitFor(() => expect(codeIntelStatus).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('code-intel-explorer'));
    expect(setValue).toHaveBeenCalledWith('CODE_INTEL_EXPLORER', '0');
  });
});
