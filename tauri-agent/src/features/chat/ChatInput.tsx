import { useCallback, useMemo, useState } from 'react';
import { useEditor } from '@lobehub/editor/react';
import { useAgentStore } from '../../stores/AgentStoreContext';
import {
  ChatInputProvider,
  type ChatInputContextValue,
  type ImageAttachment,
  type PromptImage,
} from './input/ChatInputContext';
import { MessageEditor } from './input/editor/MessageEditor';
import { composeMessage } from './input/editor/composeMessage';
import type { PastedText } from './input/editor/types';
import { DEFAULT_LEFT_ACTIONS, DEFAULT_RIGHT_ACTIONS, type ActionKey } from './input/config';

interface ChatInputProps {
  onSend: (
    message: string,
    images?: PromptImage[],
    behavior?: 'steer' | 'followUp',
  ) => Promise<void> | void;
  onAbort: () => Promise<void> | void;
  leftActions?: ActionKey[];
  rightActions?: ActionKey[];
}

export function ChatInput({
  onSend,
  onAbort,
  leftActions = DEFAULT_LEFT_ACTIONS,
  rightActions = DEFAULT_RIGHT_ACTIONS,
}: ChatInputProps) {
  const { useStore } = useAgentStore();
  const isStreaming = useStore((s) => s.isStreaming);
  const steering = useStore((s) => s.steering);
  const followUp = useStore((s) => s.followUp);
  const editor = useEditor();
  const [empty, setEmpty] = useState(true);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [pastedTexts, setPastedTexts] = useState<PastedText[]>([]);

  const send = useCallback(() => {
    const markdown = String(editor.getDocument('markdown') || '');
    const text = composeMessage(markdown, pastedTexts);
    const images: PromptImage[] = attachments.map(({ type, mimeType, data }) => ({
      type,
      mimeType,
      data,
    }));
    if (!text && images.length === 0) return;
    editor.cleanDocument();
    setAttachments([]);
    setPastedTexts([]);
    setEmpty(true);
    requestAnimationFrame(() => editor.focus());
    // 执行中发送 = 引导当前回合（steer）；空闲时 = 新一轮提示。
    void onSend(text, images.length ? images : undefined, isStreaming ? 'steer' : undefined);
  }, [editor, pastedTexts, attachments, isStreaming, onSend]);

  const stop = useCallback(() => {
    void onAbort();
  }, [onAbort]);

  const setValue = useCallback(
    (text: string) => {
      if (text) editor.setDocument('markdown', text);
      else editor.cleanDocument();
      setEmpty(!text);
      requestAnimationFrame(() => editor.focus());
    },
    [editor],
  );

  const ctx: ChatInputContextValue = useMemo(
    () => ({
      editor,
      empty,
      setEmpty,
      setValue,
      attachments,
      addAttachments: (items) => setAttachments((prev) => [...prev, ...items]),
      removeAttachment: (index) => setAttachments((prev) => prev.filter((_, i) => i !== index)),
      pastedTexts,
      addPastedText: (text) => setPastedTexts((prev) => [...prev, text]),
      removePastedText: (id) => setPastedTexts((prev) => prev.filter((p) => p.id !== id)),
      isStreaming,
      steering,
      followUp,
      send,
      stop,
    }),
    [editor, empty, setValue, attachments, pastedTexts, isStreaming, steering, followUp, send, stop],
  );

  return (
    <ChatInputProvider value={ctx}>
      <MessageEditor leftActions={leftActions} rightActions={rightActions} />
    </ChatInputProvider>
  );
}
