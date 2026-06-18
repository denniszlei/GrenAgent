import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleContainer } from './ModuleContainer';
import { useModuleStore } from '../../stores/moduleStore';

vi.mock('../knowledge/KnowledgePanel', () => ({ KnowledgePanel: () => <div>KB_PANEL</div> }));
vi.mock('../memory/MemoryPanel', () => ({ MemoryPanel: () => <div>MEM_PANEL</div> }));
vi.mock('../review/ReviewPanel', () => ({ ReviewPanel: () => <div>RV_PANEL</div> }));
vi.mock('../settings/SettingsPanel', () => ({ SettingsPanel: () => <div>SET_PANEL</div> }));
vi.mock('../connections/ConnectionsPanel', () => ({ ConnectionsPanel: () => <div>CONN_PANEL</div> }));

beforeEach(() => {
  useModuleStore.setState({ activeModule: 'chat' });
});

afterEach(() => {
  cleanup();
});

describe('ModuleContainer', () => {
  it('renders chat content when chat module is active', () => {
    render(<ModuleContainer chat={<div>CHAT_CONTENT</div>} />);
    expect(screen.getByText('CHAT_CONTENT')).toBeTruthy();
  });

  const cases: [string, string][] = [
    ['knowledge', 'KB_PANEL'],
    ['memory', 'MEM_PANEL'],
    ['review', 'RV_PANEL'],
    ['settings', 'SET_PANEL'],
    ['connections', 'CONN_PANEL'],
  ];
  for (const [mod, text] of cases) {
    it(`renders ${text} for ${mod} module`, () => {
      useModuleStore.setState({ activeModule: mod as never });
      render(<ModuleContainer chat={<div>CHAT_CONTENT</div>} />);
      expect(screen.getByText(text)).toBeTruthy();
    });
  }
});
