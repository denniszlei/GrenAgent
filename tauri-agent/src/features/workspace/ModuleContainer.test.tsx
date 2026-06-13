import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleContainer } from './ModuleContainer';
import { useModuleStore } from '../../stores/moduleStore';

vi.mock('../knowledge/KnowledgePanel', () => ({ KnowledgePanel: () => <div>KB_PANEL</div> }));
vi.mock('../memory/MemoryPanel', () => ({ MemoryPanel: () => <div>MEM_PANEL</div> }));

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

  it('renders KnowledgePanel for knowledge module', () => {
    useModuleStore.setState({ activeModule: 'knowledge' });
    render(<ModuleContainer chat={<div>CHAT_CONTENT</div>} />);
    expect(screen.getByText('KB_PANEL')).toBeTruthy();
    expect(screen.queryByText('CHAT_CONTENT')).toBeNull();
  });

  it('renders MemoryPanel for memory module', () => {
    useModuleStore.setState({ activeModule: 'memory' });
    render(<ModuleContainer chat={<div>CHAT_CONTENT</div>} />);
    expect(screen.getByText('MEM_PANEL')).toBeTruthy();
  });

  it('renders placeholder with module title for not-yet-built modules', () => {
    useModuleStore.setState({ activeModule: 'review' });
    render(<ModuleContainer chat={<div>CHAT_CONTENT</div>} />);
    const panel = screen.getByTestId('placeholder-panel');
    expect(panel.textContent).toContain('审查');
    expect(screen.queryByText('CHAT_CONTENT')).toBeNull();
  });
});
