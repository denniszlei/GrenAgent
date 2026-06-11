import { useMessageStore } from '../../store';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ToolExecution } from '../tools/ToolExecution';

export function MessageList() {
  const messages = useMessageStore((state) => state.messages);
  const streamingMessage = useMessageStore((state) => state.streamingMessage);
  const toolExecutions = useMessageStore((state) => state.toolExecutions);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg, idx) => (
        msg.role === 'user' ? (
          <UserMessage key={idx} message={msg} />
        ) : (
          <AssistantMessage key={idx} message={msg} />
        )
      ))}

      {Array.from(toolExecutions.values()).map((execution) => (
        <ToolExecution key={execution.toolCallId} execution={execution} />
      ))}

      {streamingMessage && (
        <AssistantMessage message={streamingMessage as any} />
      )}
    </div>
  );
}
