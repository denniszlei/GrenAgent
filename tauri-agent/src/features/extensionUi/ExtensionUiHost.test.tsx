import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { respond, setStatus } = vi.hoisted(() => ({
  respond: vi.fn(() => Promise.resolve()),
  setStatus: vi.fn(),
}));
let emit: (e: unknown) => void = () => {};
vi.mock('../../lib/pi', () => ({
  onPiUiRequest: (h: (e: unknown) => void) => {
    emit = h;
    return Promise.resolve(() => {});
  },
  extensionUiRespond: respond,
}));
vi.mock('../../stores/planModeStore', () => ({
  usePlanModeStore: { getState: () => ({ setStatus }) },
}));

import { ExtensionUiHost } from './ExtensionUiHost';

afterEach(() => {
  cleanup();
  respond.mockClear();
  setStatus.mockClear();
});

describe('ExtensionUiHost', () => {
  it('responds to select with { type, id, value }', async () => {
    render(<ExtensionUiHost />);
    emit({ workspace: '/ws', request: { id: 'u1', method: 'select', title: '允许？', options: ['允许', '拒绝'] } });
    await waitFor(() => expect(screen.getByText('允许？')).toBeTruthy());
    fireEvent.click(screen.getByText('拒绝'));
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith('/ws', { type: 'extension_ui_response', id: 'u1', value: '拒绝' }),
    );
  });

  it('responds to confirm with { type, id, confirmed }', async () => {
    render(<ExtensionUiHost />);
    emit({ workspace: '/ws', request: { id: 'u2', method: 'confirm', title: '项目信任', message: '信任此工作区？' } });
    await waitFor(() => expect(screen.getByText('信任此工作区？')).toBeTruthy());
    fireEvent.click(screen.getByText('确定'));
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith('/ws', { type: 'extension_ui_response', id: 'u2', confirmed: true }),
    );
  });

  it('routes setStatus(plan-mode) to the store without opening a modal', () => {
    render(<ExtensionUiHost />);
    emit({ workspace: '/ws', request: { id: 's1', method: 'setStatus', statusKey: 'plan-mode', statusText: '📋 Plan' } });
    expect(setStatus).toHaveBeenCalledWith('📋 Plan');
    expect(screen.queryByText('📋 Plan')).toBeNull();
  });
});
