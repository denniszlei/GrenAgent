import { ActionIcon } from '@lobehub/ui';
import { BookPlus } from 'lucide-react';
import { useChatInput } from '../ChatInputContext';

export default function KbAddAction() {
  const { setValue } = useChatInput();
  return (
    <ActionIcon
      icon={BookPlus}
      size="small"
      title="加入知识库"
      onClick={() => setValue('请把以下内容加入知识库（使用 kb_add 工具）：\n')}
    />
  );
}
