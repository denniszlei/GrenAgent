import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillInfo } from '../../lib/skillsIo';

const { getSettings, setSettings, closeWorkspace, openWorkspace } = vi.hoisted(() => ({
  getSettings: vi.fn((): Promise<Record<string, string>> => Promise.resolve({})),
  setSettings: vi.fn(() => Promise.resolve()),
  closeWorkspace: vi.fn(() => Promise.resolve()),
  openWorkspace: vi.fn(() => Promise.resolve({})),
}));
const { listSkills, createSkill, deleteSkill } = vi.hoisted(() => ({
  listSkills: vi.fn((): Promise<SkillInfo[]> => Promise.resolve([])),
  createSkill: vi.fn(() => Promise.resolve({ name: '', description: '', path: '', scope: 'global' })),
  deleteSkill: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../stores/AgentStoreContext', () => ({
  useAgentStoreContext: () => ({ workspace: '/ws' }),
}));
vi.mock('../../lib/pi', () => ({
  pi: { getSettings, setSettings, closeWorkspace, openWorkspace },
}));
vi.mock('../../lib/skillsIo', () => ({ listSkills, createSkill, deleteSkill }));

import { ThemeProvider } from '@lobehub/ui';
import { ExtensionsPanel } from './ExtensionsPanel';

// jsdom 下 Modal/Switch/Popconfirm 重渲染较慢（本机 transform/import 开销大），放宽超时避免误判。
vi.setConfig({ testTimeout: 45000 });

const skill = (name: string, description = ''): SkillInfo => ({
  name,
  description,
  path: `/home/.agents/skills/${name}`,
  scope: 'global',
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ExtensionsPanel', () => {
  it('lists MCP servers from MCP_SERVERS (standard mcpServers format)', async () => {
    getSettings.mockResolvedValueOnce({
      MCP_SERVERS: '{"mcpServers":{"fs":{"command":"npx","args":[]},"api":{"url":"https://m"}}}',
    });
    render(<ExtensionsPanel />);
    await waitFor(() => expect(screen.getByTestId('mcp-server-fs')).toBeTruthy());
    expect(screen.getByTestId('mcp-server-fs').textContent).toContain('stdio');
    expect(screen.getByTestId('mcp-server-api').textContent).toContain('sse');
  });

  it('switches to the skills tab and lists skills from disk (bare names), toggling via the switch', async () => {
    getSettings.mockResolvedValueOnce({});
    listSkills.mockResolvedValueOnce([skill('openspec-propose', 'propose a change')]);
    render(<ExtensionsPanel />);
    // 默认展示「插件」(MCP) 页，切到「技能」页才渲染 skills。
    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    await waitFor(() => expect(screen.getByTestId('skill-openspec-propose')).toBeTruthy());
    // 裸名展示，不带 skill: 前缀。
    expect(screen.getByTestId('skill-openspec-propose').textContent).toContain('openspec-propose');
    expect(screen.getByTestId('skill-openspec-propose').textContent).not.toContain('skill:');
    const toggle = screen.getByTestId('skill-toggle-openspec-propose');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.getByTestId('skill-toggle-openspec-propose').getAttribute('aria-checked')).toBe('false');
  });

  it('rescans the skills dir when the refresh button is clicked', async () => {
    getSettings.mockResolvedValueOnce({});
    // 初次挂载只发现一个技能。
    listSkills.mockResolvedValueOnce([skill('first-skill')]);
    render(
      <ThemeProvider>
        <ExtensionsPanel />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    await waitFor(() => expect(screen.getByTestId('skill-first-skill')).toBeTruthy());

    // 模拟用户手动往 ~/.agents/skills 拷了一个目录，点「刷新」重新扫描即可看到。
    listSkills.mockResolvedValueOnce([skill('first-skill'), skill('added-skill')]);
    fireEvent.click(screen.getByTestId('skill-refresh'));
    await waitFor(() => expect(screen.getByTestId('skill-added-skill')).toBeTruthy());

    // 刷新会 bump reload rev → 防抖自动落盘，让 sidecar 热重载新技能（不重启）。
    await waitFor(() => expect(setSettings).toHaveBeenCalled(), { timeout: 3000 });
    expect(closeWorkspace).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it('treats a legacy skill: prefixed disabled entry as the bare skill (off)', async () => {
    getSettings.mockResolvedValueOnce({ SKILLS_DISABLED: 'skill:caveman' });
    listSkills.mockResolvedValueOnce([skill('caveman')]);
    render(<ExtensionsPanel />);
    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    await waitFor(() => expect(screen.getByTestId('skill-toggle-caveman')).toBeTruthy());
    // 旧版写入的 `skill:caveman` 应被识别为已禁用。
    expect(screen.getByTestId('skill-toggle-caveman').getAttribute('aria-checked')).toBe('false');
  });

  it('persists skill changes hot without showing a restart button', async () => {
    getSettings.mockResolvedValueOnce({});
    listSkills.mockResolvedValueOnce([skill('demo-skill')]);
    render(<ExtensionsPanel />);
    // 热更新后不再有「重启生效」按钮。
    expect(screen.queryByTestId('ext-restart')).toBeNull();

    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    await waitFor(() => expect(screen.getByTestId('skill-toggle-demo-skill')).toBeTruthy());

    // 拨动开关：改动自动落盘（写 runtime-settings.json），不出现重启按钮。
    fireEvent.click(screen.getByTestId('skill-toggle-demo-skill'));
    expect(screen.queryByTestId('ext-restart')).toBeNull();

    // 防抖自动保存 → setSettings；不重启 sidecar（不 close/open workspace）。
    await waitFor(() => expect(setSettings).toHaveBeenCalled(), { timeout: 3000 });
    expect(closeWorkspace).not.toHaveBeenCalled();
    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it('creates a skill via the add modal', async () => {
    getSettings.mockResolvedValueOnce({});
    listSkills.mockResolvedValue([]);
    render(
      <ThemeProvider>
        <ExtensionsPanel />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    fireEvent.click(screen.getByTestId('skill-add'));
    await waitFor(() => expect(screen.getByTestId('add-skill-modal')).toBeTruthy());

    fireEvent.change(screen.getByTestId('skill-name'), { target: { value: 'my-skill' } });
    fireEvent.change(screen.getByTestId('skill-description'), { target: { value: 'does a thing' } });
    fireEvent.change(screen.getByTestId('skill-body'), { target: { value: 'Step 1' } });
    fireEvent.click(screen.getByTestId('skill-submit'));

    await waitFor(() => expect(createSkill).toHaveBeenCalledWith('my-skill', 'does a thing', 'Step 1'));
  });

  it('deletes a skill after popconfirm confirmation', async () => {
    getSettings.mockResolvedValueOnce({});
    listSkills.mockResolvedValueOnce([skill('trash-me')]);
    render(
      <ThemeProvider>
        <ExtensionsPanel />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId('ext-tab-skills'));
    await waitFor(() => expect(screen.getByTestId('skill-delete-trash-me')).toBeTruthy());

    // 点删除 → 弹出气泡确认 → 点确认才真正删除。
    fireEvent.click(screen.getByTestId('skill-delete-trash-me'));
    await waitFor(() => expect(screen.getByTestId('skill-delete-confirm-trash-me')).toBeTruthy());
    expect(deleteSkill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('skill-delete-confirm-trash-me'));

    await waitFor(() =>
      expect(deleteSkill).toHaveBeenCalledWith('/home/.agents/skills/trash-me'),
    );
  });

  it('opens the add modal from the add button', async () => {
    getSettings.mockResolvedValueOnce({});
    render(
      <ThemeProvider>
        <ExtensionsPanel />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTestId('mcp-add'));
    await waitFor(() => expect(screen.getByTestId('add-mcp-modal')).toBeTruthy());
  });
});
