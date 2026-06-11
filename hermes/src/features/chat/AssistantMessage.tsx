import type { AgentMessage } from '../../lib/types';

interface AssistantMessageProps {
  message: AgentMessage;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const content = typeof message.content === 'string'
    ? message.content
    : message.content.map(p => p.text).join('');

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[70%] rounded-lg bg-gray-100 text-gray-900 px-4 py-2">
        <div>{content}</div>
        {message.thinking && (
          <details className="mt-2 text-sm text-gray-600">
            <summary className="cursor-pointer">Thinking...</summary>
            <div className="mt-1 whitespace-pre-wrap">{message.thinking}</div>
          </details>
        )}
      </div>
    </div>
  );
}
