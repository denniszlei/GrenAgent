import type { ComponentType } from 'react';
import type { DockTab, DockTabKind } from '../../stores/dockStore';
import { PageBody } from './PageBody';
import { SubAgentBody } from './SubAgentBody';

export interface DockBodyProps {
  tab: DockTab;
  active: boolean;
}

// T5 会把 terminal 替换为真正的 TerminalBody。
function TerminalBodyPlaceholder() {
  return null;
}

const BODY_RENDERERS: Record<DockTabKind, ComponentType<DockBodyProps>> = {
  terminal: TerminalBodyPlaceholder,
  page: PageBody,
  subagent: SubAgentBody,
  // file: FileBody,        // 阶段 2
  // diff: DiffBody,        // 阶段 3
  // sidechat: SideChatBody // 阶段 4
};

export function TabBodyRenderer({ tab, active }: DockBodyProps) {
  const Body = BODY_RENDERERS[tab.kind];
  return <Body tab={tab} active={active} />;
}
