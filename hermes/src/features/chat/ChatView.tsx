import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { useRpcClient } from '../../hooks/useRpcClient';

export function ChatView() {
  const client = useRpcClient('.', {});

  const handleSend = async (message: string) => {
    await client.prompt(message);
  };

  const handleAbort = async () => {
    await client.abort();
  };

  return (
    <div className="flex flex-col h-full">
      <MessageList />
      <ChatInput onSend={handleSend} onAbort={handleAbort} />
    </div>
  );
}
