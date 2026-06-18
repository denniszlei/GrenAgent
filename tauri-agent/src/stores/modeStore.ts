import { create } from 'zustand';

export type AgentMode = 'agent' | 'ask' | 'debug' | 'plan';

export const AGENT_MODES: AgentMode[] = ['agent', 'ask', 'debug', 'plan'];

/** 模式显示名（选择器选项用）。 */
export const MODE_LABELS: Record<AgentMode, string> = {
  agent: 'Agent',
  ask: 'Ask',
  debug: 'Debug',
  plan: 'Plan',
};

/** 模式说明（选择器副标题 / tooltip 用）。 */
export const MODE_HINTS: Record<AgentMode, string> = {
  agent: '完整能力，读写执行皆可',
  ask: '只读问答，禁写/编辑/命令行/MCP',
  debug: '调试排查，插桩取证后最小修复',
  plan: '只读规划，产出步骤再执行',
};

export function isAgentMode(v: unknown): v is AgentMode {
  return v === 'agent' || v === 'ask' || v === 'debug' || v === 'plan';
}

interface ModeState {
  /** 各 workspace 的当前模式（由 sidecar agent-mode 扩展经 setStatus 推送回读）。 */
  byWorkspace: Record<string, AgentMode>;
  setMode: (workspace: string, mode: AgentMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  byWorkspace: {},
  setMode: (workspace, mode) =>
    set((s) =>
      s.byWorkspace[workspace] === mode
        ? s
        : { byWorkspace: { ...s.byWorkspace, [workspace]: mode } },
    ),
}));
