import { useState } from 'react';
import { ChatListView } from './ChatListView';
import { ChatInput } from './ChatInput';
import type { PromptImage } from './input/ChatInputContext';
import { pi } from '../../lib/pi';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';

export function ChatView() {
  const { workspace, store } = useAgentStoreContext();
  const [inputHeight, setInputHeight] = useState(120);

  const handleSend = async (message: string, images?: PromptImage[]) => {
    const text = message.trim();
    if (!text && !images?.length) return;
    // pi 不会回发用户消息，发送前主动加入以乐观显示用户气泡。
    if (text) store.pushUserMessage(text);
    await pi.prompt(workspace, text, undefined, images);
  };

  const handleAbort = async () => {
    await pi.abort(workspace);
  };

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* 输入框绝对定位在底部，列表底部留白 = 距底 16 + 输入框高度 + 缓冲 8 */}
      <ChatListView bottomOffset={inputHeight + 24} />
      <ChatInput onSend={handleSend} onAbort={handleAbort} onHeightChange={setInputHeight} />
    </div>
  );
}
