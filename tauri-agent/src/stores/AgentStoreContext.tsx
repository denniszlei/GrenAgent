import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentStoreApi } from './agent';
import { agentStoreRegistry } from './agentStoreRegistry';

interface AgentStoreContextValue {
  workspace: string;
  store: AgentStoreApi;
  workspaceReady: boolean;
  setWorkspaceReady: (ready: boolean) => void;
}

const AgentStoreContext = createContext<AgentStoreContextValue | null>(null);

interface AgentStoreProviderProps {
  workspace: string;
  children: ReactNode;
}

/**
 * 为某个工作区提供 agent store。
 * store 由 agentStoreRegistry 常驻管理：切换 workspace 不再 destroy（后台继续消费事件、保留流式态），
 * 仅切换 active 标志（active 用 rAF 实时刷新、后台用 setTimeout 兜底）。
 */
export function AgentStoreProvider({ workspace, children }: AgentStoreProviderProps) {
  const store = useMemo(() => agentStoreRegistry.getOrCreate(workspace), [workspace]);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  useEffect(() => {
    setWorkspaceReady(false);
  }, [workspace]);

  useEffect(() => {
    agentStoreRegistry.setActive(workspace);
  }, [workspace]);

  const value = useMemo(
    () => ({ workspace, store, workspaceReady, setWorkspaceReady }),
    [workspace, store, workspaceReady],
  );

  return <AgentStoreContext.Provider value={value}>{children}</AgentStoreContext.Provider>;
}

/** 获取当前工作区的 agent store 上下文（workspace + store API）。 */
export function useAgentStoreContext(): AgentStoreContextValue {
  const ctx = useContext(AgentStoreContext);
  if (!ctx) {
    throw new Error('useAgentStoreContext must be used within an AgentStoreProvider');
  }
  return ctx;
}

/** 便捷获取当前工作区的 agent store API（含 useStore 选择器）。 */
export function useAgentStore(): AgentStoreApi {
  return useAgentStoreContext().store;
}
