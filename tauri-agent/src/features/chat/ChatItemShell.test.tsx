import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@lobehub/ui';
import { ChatItemShell } from './ChatItemShell';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider themeMode="dark">{ui}</ThemeProvider>);

describe('ChatItemShell', { timeout: 30_000 }, () => {
  it('user 右对齐 + 气泡，无头像', () => {
    wrap(
      <ChatItemShell placement="right" bubble>
        <span>hi</span>
      </ChatItemShell>,
    );
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('assistant 左对齐全宽', () => {
    wrap(
      <ChatItemShell placement="left">
        <span>yo</span>
      </ChatItemShell>,
    );
    expect(screen.getByText('yo')).toBeTruthy();
  });
});
