import type { TimelineSegment, ToolSegment } from './groupMessages';
import { isContextTool, skillNameFromRead } from '../tools/toolUtils';

export type TurnRow =
  | { kind: 'segment'; id: string; segment: TimelineSegment }
  | { kind: 'context'; id: string; tools: ToolSegment[] };

/**
 * 把一轮的扁平时间线段落折叠成渲染行：连续 2 个及以上的「查找类」工具
 *（read/grep/glob/list）合并成一条 context 折叠行，其余（思考、正文、动作工具、
 * 以及落单的查找工具）按原顺序逐行展开。折叠行始终停留在它在时间线里的真实位置。
 *
 * 例外：模型用 read 读取 SKILL.md 是「调用技能」，语义上不是普通上下文收集——把它从折叠里
 * 排除，单独渲染成技能调用卡（见 ToolExecution 的 skill 分支）。
 */
export function buildTurnRows(segments: TimelineSegment[]): TurnRow[] {
  const rows: TurnRow[] = [];
  let buffer: ToolSegment[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length >= 2) {
      rows.push({ kind: 'context', id: `ctx-${buffer[0]!.id}`, tools: buffer });
    } else {
      const only = buffer[0]!;
      rows.push({ kind: 'segment', id: only.id, segment: only });
    }
    buffer = [];
  };

  for (const segment of segments) {
    if (
      segment.kind === 'tool' &&
      isContextTool(segment.toolName) &&
      !skillNameFromRead(segment.toolName, segment.args)
    ) {
      buffer.push(segment);
      continue;
    }
    flush();
    rows.push({ kind: 'segment', id: segment.id, segment });
  }
  flush();
  return rows;
}
