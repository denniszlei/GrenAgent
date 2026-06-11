import type { AgentMessage } from '../../lib/types';

interface UserMessageProps {
  message: AgentMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  const content = typeof message.content === 'string'
    ? message.content
    : message.content.map(p => p.text).join('');

  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[70%] rounded-lg bg-blue-500 text-white px-4 py-2">
        {content}
      </div>
    </div>
  );
}
