import type { ChatTagCategory } from './types';

/** 标签序列化成消息文本：文件/目录写 `@路径`，命令写 `/名称`。 */
export function tagToText(category: ChatTagCategory, value: string): string {
  return category === 'command' ? `/${value}` : `@${value}`;
}
