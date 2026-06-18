import { useEffect, useRef, useState, type RefObject } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { INSERT_MENTION_COMMAND, type IEditor } from '@lobehub/editor';
import { $getSelection, $isRangeSelection } from 'lexical';
import { files } from '../../../../lib/files';
import { binaryToImageAttachment } from './imageAttachment';
import { fileMentionMeta } from './mention';
import { countLines, isLongPaste, makePastedText } from './pastedText';
import { loadFiles } from './useFileMention';
import type { ImageAttachment } from '../ChatInputContext';
import type { PastedText } from './types';

/** 当前拖放是文件（原生路径）还是应用内选区文本——用于输入区提示文案。 */
export type DragKind = 'file' | 'text';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg']);

// 可读成文本块的扩展名（白名单）；其余二进制/未知类型回退为 `@` 引用。
const TEXT_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx', 'txt', 'text', 'log', 'csv', 'tsv',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'rs', 'py', 'go', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'cs', 'rb', 'php', 'lua',
  'sh', 'bash', 'zsh', 'fish', 'sql', 'vue', 'svelte', 'astro', 'swift', 'dart', 'scala', 'r', 'jl',
  'gradle', 'properties', 'dockerfile', 'makefile', 'gitignore', 'editorconfig',
]);

// 读文本的体积上限（base64 长度，约对应 3MB 原文件）：超过则回退 `@` 引用，避免一次灌入巨量文本卡顿。
const MAX_TEXT_B64 = 4_000_000;

// 「短文本」上限：超过即不直接拼进 prompt，而是落地工作区 @ 引用让 agent 按需读取，避免上下文爆炸。
const LARGE_TEXT_CHARS = 32 * 1024;
const LARGE_TEXT_LINES = 600;

interface Options {
  editor: IEditor;
  workspace: string;
  zoneRef: RefObject<HTMLElement | null>;
  onImages: (items: ImageAttachment[]) => void;
  /** 把拖入的文本文件内容作为「文件块」chip 暂存（发送时展开拼进消息）。 */
  onPastedText: (text: PastedText) => void;
}

function extOf(p: string): string {
  const dot = p.lastIndexOf('.');
  return dot >= 0 ? p.slice(dot + 1).toLowerCase() : '';
}

function baseName(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

function isTextFile(path: string, mime: string): boolean {
  if (mime.startsWith('text/')) return true;
  if (/^application\/(json|xml|javascript|x-yaml|yaml|x-sh|toml|x-toml)/.test(mime)) return true;
  return TEXT_EXT.has(extOf(path)) || TEXT_EXT.has(baseName(path).toLowerCase());
}

function decodeText(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * 监听 Tauri 的原生文件拖放（默认 dragDropEnabled，给到的是绝对路径）。
 * 落在输入区内才处理：工作区内图片读成附件，文本文件读内容作为「文件块」chip（像粘贴长文本，
 * 发送时展开拼进消息），目录 / 工作区外 / 二进制 / 读失败回退为 `@` 引用 pill。
 */
export function useTauriFileDrop({ editor, workspace, zoneRef, onImages, onPastedText }: Options) {
  const [dragOver, setDragOver] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>('file');
  // 应用内拖拽的选区文本：原生 dragDrop 拦截了 OS 拖放、Windows 下 HTML5 drop 被抑制，且 Tauri 的
  // drop 事件只回传文件路径不含文本。故在 dragstart 时把选区文本截存，Tauri 'drop' 落在输入区且
  // 无文件路径时再插入——让「从消息里拖一段文字进输入框」可用。
  const dragTextRef = useRef('');

  useEffect(() => {
    const onDragStart = () => {
      dragTextRef.current = window.getSelection()?.toString() ?? '';
    };
    const onDragEnd = () => {
      dragTextRef.current = '';
    };
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const isOver = (pos: { x: number; y: number } | undefined): boolean => {
      const el = zoneRef.current;
      if (!el || !pos) return false;
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = pos.x / dpr;
      const y = pos.y / dpr;
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    // 应用内拖入的纯文本：长文本走「粘贴文本」chip（与粘贴一致，避免上下文爆炸），短文本插入光标处。
    const insertDroppedText = (text: string) => {
      if (isLongPaste(text)) {
        onPastedText(makePastedText(text));
        return;
      }
      editor.focus();
      editor.getLexicalEditor()?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      });
    };

    const insertMention = (rel: string | null, normPath: string, name: string, isDirectory: boolean) => {
      editor.focus();
      editor.dispatchCommand(INSERT_MENTION_COMMAND, {
        label: name,
        metadata: fileMentionMeta(rel ?? normPath, name, isDirectory),
      });
      editor.getLexicalEditor()?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(' ');
      });
    };

    const handleDrop = async (paths: string[]) => {
      // 先把本次拖入的绝对路径登记到白名单，工作区外文件随后才能被 readDropped 安全读取。
      await files.registerDroppedFiles(paths).catch(() => {});

      let root = '';
      let flat: { path: string; isDirectory: boolean }[] = [];
      try {
        const entry = await loadFiles(workspace);
        root = entry.root;
        flat = entry.files;
      } catch {
        /* best effort */
      }

      const images: ImageAttachment[] = [];

      for (const abs of paths) {
        const normPath = abs.replace(/\\/g, '/');
        const rel = root && normPath.startsWith(`${root}/`) ? normPath.slice(root.length + 1) : null;
        const indexed = rel ? flat.find((f) => f.path === rel) : undefined;
        const isDirectory = indexed?.isDirectory ?? false;
        const name = baseName(normPath);

        // 文件（含工作区外）：读一次 binary（区内走相对路径、区外走拖放白名单），按类型分流：
        // 图片→附件，文本→文件块 chip（区内标相对路径、区外标文件名），其余/失败→ @ 引用。
        if (!isDirectory) {
          try {
            const bin = rel
              ? await files.readBinary(workspace, rel)
              : await files.readDropped(normPath);
            if (IMAGE_EXT.has(extOf(normPath)) || bin.mime_type.startsWith('image/')) {
              images.push(binaryToImageAttachment(name, bin.mime_type, bin.data));
              continue;
            }
            if (bin.data.length <= MAX_TEXT_B64 && isTextFile(normPath, bin.mime_type)) {
              const content = decodeText(bin.data);
              // 短文本：直接读内容做文件块 chip（方便查看）；
              // 超长文本：不在此拼接，落到下方 @ 引用，让 agent 按需读取，避免上下文爆炸。
              if (content && content.length <= LARGE_TEXT_CHARS && countLines(content) <= LARGE_TEXT_LINES) {
                onPastedText(makePastedText(content, rel ?? name));
                continue;
              }
            }
            // 二进制 / 超长文本 / 解码失败：落地工作区让 agent 用 read/python 等工具按需读取解析。
            // 工作区内直接 @ 原相对路径；工作区外复制进 .pi/dropped/ 再 @ 相对路径（工具才读得到）。
            if (rel) {
              insertMention(rel, normPath, name, false);
              continue;
            }
            const importedRel = await files.importDropped(workspace, normPath);
            insertMention(importedRel, normPath, name, false);
            continue;
          } catch {
            /* 读 / 复制失败：回退为 @ 引用 */
          }
        }

        // 目录 / 读失败 → 回退为 @ 引用 pill。
        insertMention(rel, normPath, name, isDirectory);
      }

      if (images.length > 0) onImages(images);
    };

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'over') {
          const over = isOver(payload.position);
          setDragOver(over);
          // dragstart 已截下选区文本 → 本次是「拖文字」，提示文案随之切换。
          if (over) setDragKind(dragTextRef.current ? 'text' : 'file');
          return;
        }
        if (payload.type === 'leave') {
          setDragOver(false);
          return;
        }
        if (payload.type === 'drop') {
          const over = isOver(payload.position);
          setDragOver(false);
          const text = dragTextRef.current;
          dragTextRef.current = '';
          if (!over) return;
          // 无文件路径但有选区文本 → 应用内拖文字，插入文本；否则按文件拖放处理。
          if (payload.paths.length === 0) {
            if (text) insertDroppedText(text);
            return;
          }
          void handleDrop(payload.paths);
        }
      })
      .then((u) => {
        if (active) unlisten = u;
        else u();
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, [editor, workspace, zoneRef, onImages, onPastedText]);

  return { dragOver, dragKind };
}
