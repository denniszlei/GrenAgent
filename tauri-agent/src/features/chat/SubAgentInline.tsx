import { ActionIcon, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Bot, ChevronRight, CircleStop, Loader2, PanelRightOpen } from 'lucide-react';
import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { cardStyles } from '../tools/cardStyles';
import { LazyMarkdown } from './LazyMarkdown';
import {
  formatTokens,
  isBackgroundSpawn,
  subAgentFinalText,
  subAgentId,
  subAgentStats,
  subAgentStepCount,
} from '../panels/subagentUtils';
import { useDockStore } from '../../stores/dockStore';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi } from '../../lib/pi';

const styles = createStaticStyles(({ css }) => ({
  head: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillQuaternary};
    cursor: pointer;
    user-select: none;

    &:hover {
      border-color: ${cssVar.colorBorder};
    }
  `,
  left: css`
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
  `,
  right: css`
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  `,
  label: css`
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  chip: css`
    overflow: hidden;
    flex-shrink: 1;
    min-width: 0;
    padding: 2px 10px;
    border-radius: 999px;
    background: ${cssVar.colorFillTertiary};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  stats: css`
    overflow: hidden;
    flex-shrink: 0;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  running: css`
    flex: none;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
  badge: css`
    flex: none;
    padding: 1px 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusSM};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  chevron: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
    transition: transform 0.15s;
  `,
  chevronOpen: css`
    transform: rotate(90deg);
  `,
  body: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-block-start: 6px;
    /* 与折叠详情同款层级竖线 + 缩进，表明这是该子代理的子内容。 */
    margin-inline-start: 11px;
    padding-inline-start: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sectionLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  sectionLabelRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-block-end: 4px;
  `,
  promptBox: css`
    overflow: auto;
    max-height: 240px;
    padding: 8px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillTertiary};
  `,
  resultBox: css`
    overflow: auto;
    max-height: 320px;
    padding: 8px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  hint: css`
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
  openLink: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillTertiary};
      color: ${cssVar.colorText};
    }
  `,
}));

interface SubAgentInlineProps {
  /** 对应主对话里 spawn_agent 工具消息的 id，也是右坞 subagent tab 的 id。 */
  messageId: string;
  /** spawn_agent 工具调用 id，传给右坞 tab 以定位结果。 */
  toolCallId: string;
  index: number;
  task: string;
  result: unknown;
  status: 'running' | 'done' | 'error';
}

function mapRegistryStatus(status: string | undefined): 'running' | 'done' | 'error' {
  if (status === 'running') return 'running';
  if (status === 'error' || status === 'cancelled') return 'error';
  return 'done';
}

/**
 * 流内内联子代理（对齐 lobehub callSubAgent 观感）：
 * - 折叠行：bot 图标 + 「子代理 #N」 + 任务 chip + 统计尾（model · N 工具 · Xk tokens）+ 状态徽章。
 * - 展开：「指令」框（任务）+「结果」框（最终输出文本）+「打开完整对话」按钮（右坞看完整回放）。
 *
 * 关键：展开只渲染静态的任务与最终结果文本，绝不内联回放流式 transcript（完整对话点按钮在右坞看），
 * 既保持主会话干净，也避免流式中反复解析 transcript 造成卡顿。
 */
function SubAgentInlineInner({ messageId, toolCallId, index, task, result, status }: SubAgentInlineProps) {
  const card = cardStyles;
  const { workspace } = useAgentStoreContext();
  const agentId = useMemo(() => subAgentId(result), [result]);
  const background = useMemo(() => isBackgroundSpawn(result), [result]);
  const [bgStatus, setBgStatus] = useState<string | null>(background ? 'running' : null);
  const [expanded, setExpanded] = useState(false);
  const effectiveStatus = useMemo(() => {
    if (status === 'running') return 'running' as const;
    if (background && bgStatus === 'running') return 'running' as const;
    if (background && bgStatus) return mapRegistryStatus(bgStatus);
    return status;
  }, [status, background, bgStatus]);

  useEffect(() => {
    if (!background || !agentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const rows = await pi.subagentList(workspace);
        if (cancelled) return;
        const next = rows.find((r) => r.id === agentId)?.status ?? 'done';
        setBgStatus(next);
        // 终态即停轮询：避免对已结束的后台子代理永久每 2s 读 sqlite。
        if (next !== 'running' && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      } catch {
        // 跨进程读 registry 偶发 SQLITE_BUSY：保留上次状态，下个 tick 再试。
      }
    };
    void poll();
    timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [workspace, background, agentId]);

  const openInDock = (e?: MouseEvent) => {
    e?.stopPropagation();
    useDockStore.getState().openSubAgent({
      messageId,
      toolCallId,
      subIndex: null,
      title: `#${index} ${task}`,
    });
  };

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    if (status === 'running') {
      void pi.abort(workspace);
      return;
    }
    if (agentId && (background || bgStatus === 'running')) {
      void pi.subagentCancel(workspace, agentId);
      setBgStatus('cancelled');
    }
  };

  const running = effectiveStatus === 'running';
  const color =
    effectiveStatus === 'done'
      ? cssVar.colorSuccess
      : effectiveStatus === 'error'
        ? cssVar.colorError
        : cssVar.colorTextSecondary;

  // 统计/步数/最终文本仅在终态解析一次：运行中频繁更新的 transcript 不在主对话里反复解析（性能）。
  const stats = useMemo(() => (running ? null : subAgentStats(result)), [running, result]);
  const steps = useMemo(() => (running ? 0 : subAgentStepCount(result)), [running, result]);
  const finalText = useMemo(() => (running ? '' : subAgentFinalText(result)), [running, result]);
  const statsText = stats
    ? [
        stats.model,
        stats.totalToolCalls ? `${stats.totalToolCalls} 个工具` : null,
        stats.totalTokens ? `${formatTokens(stats.totalTokens)} tokens` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const badge =
    effectiveStatus === 'done'
      ? `已完成${steps ? ` · ${steps} 步` : ''}`
      : effectiveStatus === 'error'
        ? bgStatus === 'cancelled'
          ? '已停止'
          : `出错${steps ? ` · ${steps} 步` : ''}`
        : '';

  return (
    <div data-testid="subagent-inline">
      <div className={styles.head} onClick={() => setExpanded((v) => !v)}>
        <div className={styles.left}>
          <Icon icon={running ? Loader2 : Bot} size={14} spin={running} style={{ color, flex: 'none' }} />
          <b className={styles.label}>子代理 #{index}</b>
          <span className={cx(styles.chip, running && card.shinyText)}>{task}</span>
          {running ? (
            <span className={cx(styles.running, card.shinyText)}>运行中…</span>
          ) : (
            <>
              {statsText ? <span className={styles.stats}>{statsText}</span> : null}
              {badge ? <span className={styles.badge}>{badge}</span> : null}
            </>
          )}
        </div>
        <div className={styles.right}>
          {running ? (
            <ActionIcon icon={CircleStop} size="small" title="停止子代理" onClick={stop} />
          ) : null}
          <ActionIcon
            icon={PanelRightOpen}
            size="small"
            title="在右侧面板打开完整对话"
            onClick={openInDock}
          />
          <Icon
            icon={ChevronRight}
            size={14}
            className={cx(styles.chevron, expanded && styles.chevronOpen)}
          />
        </div>
      </div>

      {expanded ? (
        <div className={styles.body}>
          <div>
            <div className={styles.sectionLabel} style={{ marginBlockEnd: 4 }}>
              指令
            </div>
            <div className={styles.promptBox}>
              <LazyMarkdown variant="chat" fontSize={13}>
                {task}
              </LazyMarkdown>
            </div>
          </div>
          <div>
            <div className={styles.sectionLabelRow}>
              <span className={styles.sectionLabel}>结果</span>
              <button type="button" className={styles.openLink} onClick={openInDock}>
                <Icon icon={PanelRightOpen} size={12} />
                打开完整对话
              </button>
            </div>
            {running ? (
              <div className={styles.hint}>运行中…（点「打开完整对话」在右侧面板看实时进度）</div>
            ) : finalText ? (
              <div className={styles.resultBox}>
                <LazyMarkdown variant="chat" fontSize={13}>
                  {finalText}
                </LazyMarkdown>
              </div>
            ) : (
              <div className={styles.hint}>（无输出）</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// memo：状态卡只在本子代理自身 result/status 变化时重渲染（result 对未变消息引用稳定），
// 避免主对话其他消息流式更新时整张卡片被动重渲染。
export const SubAgentInline = memo(SubAgentInlineInner);
