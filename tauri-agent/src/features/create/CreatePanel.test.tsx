import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));

const { createList, createImage, openPath } = vi.hoisted(() => ({
  createList: vi.fn(() =>
    Promise.resolve([
      { name: 'img_2.png', bytes: 2048, modifiedMs: 200 },
      { name: 'img_1.png', bytes: 1024, modifiedMs: 100 },
    ]),
  ),
  createImage: vi.fn(() => Promise.resolve('QUJD')),
  openPath: vi.fn(),
}));
vi.mock('../../lib/pi', () => ({ pi: { createList, createImage } }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: (p: string) => openPath(p) }));

import { CreatePanel } from './CreatePanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CreatePanel', () => {
  it('lists images', async () => {
    render(<CreatePanel />);
    await waitFor(() => expect(screen.getByTestId('cr-header').textContent).toContain('2'));
    expect(screen.getByTestId('cr-item-img_2.png')).toBeTruthy();
    expect(screen.getByTestId('cr-item-img_1.png')).toBeTruthy();
  });

  it('loads base64 preview when an image is selected', async () => {
    render(<CreatePanel />);
    await waitFor(() => expect(screen.getByTestId('cr-item-img_1.png')).toBeTruthy());
    fireEvent.click(screen.getByTestId('cr-item-img_1.png'));
    await waitFor(() => expect(createImage).toHaveBeenCalledWith('/ws', 'img_1.png'));
    await waitFor(() => {
      const img = screen.getByTestId('cr-preview') as HTMLImageElement;
      expect(img.getAttribute('src')).toContain('data:image/png;base64,QUJD');
    });
  });
});
