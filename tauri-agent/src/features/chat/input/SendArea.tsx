import { Button, Flexbox, Icon } from '@lobehub/ui';
import { ArrowUp, Square } from 'lucide-react';
import { actionMap, type ActionKey } from './config';
import { useChatInput } from './ChatInputContext';

interface SendAreaProps {
  actions: ActionKey[];
}

export function SendArea({ actions }: SendAreaProps) {
  const { empty, attachments, pastedTexts, isStreaming, send, stop } = useChatInput();
  const canSend = !empty || attachments.length > 0 || pastedTexts.length > 0;
  // 执行中且有内容 → 发送即引导当前回合；执行中且为空 → 停止。
  const showStop = isStreaming && !canSend;

  return (
    <Flexbox horizontal align="center" gap={2}>
      {actions.map((key) => {
        const Render = actionMap[key];
        return <Render key={key} />;
      })}
      <Button
        type="primary"
        shape="circle"
        disabled={!showStop && !canSend}
        title={showStop ? '停止' : isStreaming ? '引导' : '发送'}
        icon={<Icon icon={showStop ? Square : ArrowUp} size={16} />}
        onClick={() => (showStop ? stop() : send())}
      />
    </Flexbox>
  );
}
