import type { ReactNode } from 'react';
import { ChatTagView } from './input/editor/ChatTag/ChatTagView';

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'file'; path: string };

/**
 * 把用户消息文本切成普通文本段与文件引用段。
 * 文件引用沿用 messenger 的 `@相对路径` 约定：只匹配「行首或空白后的 @ + 非空白串」，
 * 借此避开 email（a@b.com，@ 前是字母）这类误命中。
 */
export function parseMessageTags(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const re = /(^|\s)@([^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const atPos = m.index + m[1].length;
    if (atPos > last) segments.push({ type: 'text', text: text.slice(last, atPos) });
    segments.push({ type: 'file', path: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

/**
 * 渲染用户消息：把 `@相对路径` 渲染成与输入框一致的文件标签 chip（显示完整相对路径，
 * 让用户一眼看出引用的是哪个文件），其余按纯文本（保留换行）输出。
 */
export function renderMessageTags(text: string): ReactNode {
  return parseMessageTags(text).map((seg, i) =>
    seg.type === 'file' ? (
      <ChatTagView key={i} category="file" label={seg.path} value={seg.path} />
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  );
}
