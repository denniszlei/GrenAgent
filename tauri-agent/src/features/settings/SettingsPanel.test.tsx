import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getSettings, setSettings, closeWorkspace, openWorkspace } = vi.hoisted(() => ({
  getSettings: vi.fn(() => Promise.resolve({ OPENAI_API_KEY: 'sk-old' })),
  setSettings: vi.fn(() => Promise.resolve()),
  closeWorkspace: vi.fn(() => Promise.resolve()),
  openWorkspace: vi.fn(() => Promise.resolve({})),
}));
vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
vi.mock('../../lib/pi', () => ({
  pi: { getSettings, setSettings, closeWorkspace, openWorkspace },
}));

import { SettingsPanel } from './SettingsPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SettingsPanel', () => {
  it('renders categories and prefills loaded values', async () => {
    render(<SettingsPanel />);
    await waitFor(() => expect(screen.getByTestId('set-cat-general')).toBeTruthy());
    expect(screen.getByTestId('set-cat-knowledge')).toBeTruthy();
    const input = screen.getByTestId('set-field-OPENAI_API_KEY') as HTMLInputElement;
    expect(input.value).toBe('sk-old');
  });

  it('edits a field and saves', async () => {
    render(<SettingsPanel />);
    await waitFor(() => expect(screen.getByTestId('set-field-OPENAI_API_KEY')).toBeTruthy());
    fireEvent.change(screen.getByTestId('set-field-OPENAI_API_KEY'), { target: { value: 'sk-new' } });
    fireEvent.click(screen.getByTestId('set-save'));
    await waitFor(() =>
      expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ OPENAI_API_KEY: 'sk-new' })),
    );
  });
});
