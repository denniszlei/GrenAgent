import { useAgentStore } from '../../stores/AgentStoreContext';
import type { ChatMessage } from '../../stores/agentReducer';
import { SubAgentConversation } from '../panels/SubAgentConversation';
import { taskLabel } from '../panels/subagentUtils';
import type { SubAgentPayload } from '../../stores/dockStore';
import type { DockBodyProps } from './TabBodyRenderer';

type ToolMessage = Extract<ChatMessage, { kind: 'tool' }>;

export function SubAgentBody({ tab }: DockBodyProps) {
  const payload = tab.payload as SubAgentPayload;
  const store = useAgentStore();
  const sa = store.useStore(
    (s) => s.messages.find((m) => m.kind === 'tool' && m.id === payload.messageId) as ToolMessage | undefined,
  );
  if (!sa) return null;
  return (
    <SubAgentConversation
      key={tab.id}
      data-testid={`subagent-${payload.toolCallId}`}
      task={taskLabel(sa.args)}
      result={sa.result}
      status={sa.status}
    />
  );
}
