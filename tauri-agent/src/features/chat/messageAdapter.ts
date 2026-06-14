import type { ChatMessage as LobeChatMessage } from '@lobehub/ui/chat';
import type { DisplayMessage } from './groupMessages';

export interface AssistantGroupExtra {
  kind: 'assistantGroup';
  thinking: string;
  streaming: boolean;
  thinkingDuration?: number;
  tools: Array<{
    id: string;
    toolCallId: string;
    toolName: string;
    args: unknown;
    result: unknown;
    status: 'running' | 'done' | 'error';
  }>;
}

export interface NoticeExtra {
  kind: 'notice';
  customType: string;
  content: string;
}

export interface OrphanToolExtra {
  kind: 'orphanTool';
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: 'running' | 'done' | 'error';
}

export type ChatExtra = AssistantGroupExtra | NoticeExtra | OrphanToolExtra;

export function toLobeMessages(messages: DisplayMessage[]): LobeChatMessage[] {
  return messages.map((msg): LobeChatMessage => {
    switch (msg.kind) {
      case 'user':
        return { id: msg.id, role: 'user', content: msg.text } as LobeChatMessage;
      case 'assistantGroup':
        return {
          id: msg.id,
          role: 'assistant',
          content: msg.text,
          extra: {
            kind: 'assistantGroup',
            thinking: msg.thinking,
            streaming: msg.streaming,
            thinkingDuration: msg.thinkingDuration,
            tools: msg.tools,
          } satisfies AssistantGroupExtra,
        } as LobeChatMessage;
      case 'notice':
        return {
          id: msg.id,
          role: 'system',
          content: msg.content,
          extra: {
            kind: 'notice',
            customType: msg.customType,
            content: msg.content,
          } satisfies NoticeExtra,
        } as LobeChatMessage;
      case 'tool':
        return {
          id: msg.id,
          role: 'system',
          content: '',
          extra: {
            kind: 'orphanTool',
            toolCallId: msg.toolCallId,
            toolName: msg.toolName,
            args: msg.args,
            result: msg.result,
            status: msg.status,
          } satisfies OrphanToolExtra,
        } as LobeChatMessage;
    }
  });
}
