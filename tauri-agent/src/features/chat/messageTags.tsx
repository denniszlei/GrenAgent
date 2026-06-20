import type { ReactNode } from 'react';
import { ChatTagView } from './input/editor/ChatTag/ChatTagView';

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'file'; path: string }
  | { type: 'skill'; name: string };

// Pi expands a `/skill:<name>` command into the full SKILL.md wrapped in
// `<skill name="..." location="...">...</skill>`. The optimistic (just-sent)
// message still carries the short `/skill:<name>` text. Collapse BOTH forms to a
// compact skill chip so the bubble stays consistent before and after a reload
// (no more "wall of SKILL.md text" when switching back to a conversation).
const SKILL_BLOCK_RE = /<skill\s+name="([^"]+)"[^>]*>[\s\S]*?<\/skill>/g;
// `/skill:name` only at line start / after whitespace (mirrors the @file rule).
const INLINE_RE = /(^|\s)(\/skill:(\S+)|@(\S+))/g;

function bareSkillName(name: string): string {
  const n = name.trim();
  return n.startsWith('skill:') ? n.slice(6) : n;
}

/** Inline pass over a plain run: split out `/skill:name` and `@path` tokens. */
function parseInline(text: string, segments: MessageSegment[]): void {
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    const tokenStart = m.index + m[1].length;
    if (tokenStart > last) segments.push({ type: 'text', text: text.slice(last, tokenStart) });
    if (m[3] !== undefined) {
      segments.push({ type: 'skill', name: bareSkillName(m[3]) });
    } else {
      segments.push({ type: 'file', path: m[4] });
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
}

/**
 * 把用户消息文本切成普通文本段、技能段（`/skill:` 或展开后的 `<skill>` 块）与文件引用段。
 * 文件引用沿用 messenger 的 `@相对路径` 约定：只匹配「行首或空白后的 @ + 非空白串」，
 * 借此避开 email（a@b.com，@ 前是字母）这类误命中。
 */
export function parseMessageTags(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SKILL_BLOCK_RE.lastIndex = 0;
  while ((m = SKILL_BLOCK_RE.exec(text)) !== null) {
    if (m.index > last) parseInline(text.slice(last, m.index), segments);
    segments.push({ type: 'skill', name: bareSkillName(m[1]) });
    last = SKILL_BLOCK_RE.lastIndex;
  }
  if (last < text.length) parseInline(text.slice(last), segments);
  return segments;
}

/**
 * 渲染用户消息：`@相对路径` → 文件标签 chip；`/skill:名称` 或展开后的 `<skill>` 块 →
 * 技能命令 chip（与输入框/slash 菜单一致），其余按纯文本（保留换行）输出。
 */
export function renderMessageTags(text: string): ReactNode {
  return parseMessageTags(text).map((seg, i) => {
    if (seg.type === 'file') {
      return <ChatTagView key={i} category="file" label={seg.path} value={seg.path} />;
    }
    if (seg.type === 'skill') {
      return (
        <ChatTagView key={i} category="command" commandGroup="skill" label={seg.name} value={`skill:${seg.name}`} />
      );
    }
    return <span key={i}>{seg.text}</span>;
  });
}
