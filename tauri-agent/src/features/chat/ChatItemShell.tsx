import { memo, type ReactNode } from 'react';
import { cx } from 'antd-style';
import { chatStyles } from './chatStyles';

interface ChatItemShellProps {
  /** 'left' = 助手（全宽 ContentBlock 栈），'right' = 用户（右对齐气泡）。 */
  placement: 'left' | 'right';
  /** 用气泡包裹内容（用户消息）。助手消息不包气泡。 */
  bubble?: boolean;
  children: ReactNode;
}

/** 自研无头像消息外壳：对齐 lobehub 间距（gap 8 / paddingBlock 8 / 用户 paddingInlineStart 36）。 */
function ChatItemShellInner({ placement, bubble, children }: ChatItemShellProps) {
  const isUser = placement === 'right';
  return (
    <div className={cx(chatStyles.item, isUser && chatStyles.itemUser)}>
      <div className={cx(chatStyles.body, !isUser && chatStyles.bodyAssistant)}>
        {bubble ? <div className={chatStyles.bubble}>{children}</div> : children}
      </div>
    </div>
  );
}

export const ChatItemShell = memo(ChatItemShellInner);
