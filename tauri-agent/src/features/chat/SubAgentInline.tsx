import { ActionIcon, Block, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ChevronRight, CircleStop, Loader2, Network, PanelRightOpen } from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useCardStyles } from '../tools/cardStyles';
import { SubAgentConversation } from '../panels/SubAgentConversation';
import { isBackgroundSpawn, subAgentId, subAgentStepCount } from '../panels/subagentUtils';
import { useDockStore } from '../../stores/dockStore';
import { useLayoutStore } from '../../stores/layoutStore';
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
  title: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  strong: css`
    color: ${cssVar.colorText};
    font-weight: 600;
  `,
  badge: css`
    flex: none;
    padding: 1px 6px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusSM};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  chev: css`
    flex: none;
    display: inline-flex;
    color: ${cssVar.colorTextQuaternary};
    transition: transform 0.15s;
  `,
  chevOpen: css`
    transform: rotate(90deg);
  `,
  nested: css`
    margin-block-start: 4px;
    margin-inline-start: 11px;
    padding-inline-start: 16px;
    border-inline-start: 2px solid ${cssVar.colorBorderSecondary};
  `,
}));

interface SubAgentInlineProps {
  /** 对应主对话里 spawn_agent 工具消息的 id，也是右坞 subagent tab 的 id。 */
  messageId: string;
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
 * 流内内联子代理：可折叠外壳（Network 状态块 + 「子代理 #N · 任务」+ chevron），
 * 展开为左侧细线缩进的嵌套子会话（复用 SubAgentConversation）。运行中自动展开 + shimmer，
 * 完成后自动收起为摘要（用户仍可手动切换）。另提供「在右侧 Dock 打开」深看入口，
 * 点击激活右坞对应 subagent tab。
 */
export function SubAgentInline({ messageId, index, task, result, status }: SubAgentInlineProps) {
  const { styles: card } = useCardStyles();
  const { workspace } = useAgentStoreContext();
  const agentId = useMemo(() => subAgentId(result), [result]);
  const background = useMemo(() => isBackgroundSpawn(result), [result]);
  const [bgStatus, setBgStatus] = useState<string | null>(background ? 'running' : null);
  const effectiveStatus = useMemo(() => {
    if (status === 'running') return 'running' as const;
    if (background && bgStatus === 'running') return 'running' as const;
    if (background && bgStatus) return mapRegistryStatus(bgStatus);
    return status;
  }, [status, background, bgStatus]);
  const [open, setOpen] = useState(effectiveStatus === 'running');

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

  const openInDock = (e: MouseEvent) => {
    e.stopPropagation();
    useDockStore.getState().setActive('right', messageId);
    useLayoutStore.getState().setRightPanelOpen(true);
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

  useEffect(() => {
    setOpen(effectiveStatus === 'running');
  }, [effectiveStatus]);

  const running = effectiveStatus === 'running';
  const color =
    effectiveStatus === 'done'
      ? cssVar.colorSuccess
      : effectiveStatus === 'error'
        ? cssVar.colorError
        : cssVar.colorTextSecondary;

  const steps = useMemo(() => subAgentStepCount(result), [result]);
  const badge =
    effectiveStatus === 'done'
      ? `已完成${steps ? ` · ${steps} 步` : ''}`
      : effectiveStatus === 'error'
        ? bgStatus === 'cancelled'
          ? '已停止'
          : `出错${steps ? ` · ${steps} 步` : ''}`
        : steps
          ? `${steps} 步`
          : '';

  return (
    <div data-testid="subagent-inline">
      <div className={styles.head} onClick={() => setOpen((v) => !v)}>
        <Block
          horizontal
          align="center"
          justify="center"
          variant="outlined"
          style={{ flex: 'none', width: 24, height: 24, color }}
        >
          <Icon icon={running ? Loader2 : Network} size={14} spin={running} />
        </Block>
        <span className={cx(styles.title, running && card.shinyText)}>
          <b className={styles.strong}>子代理 #{index}</b> · {task}
          {running ? '（运行中…）' : ''}
        </span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        {running ? (
          <ActionIcon icon={CircleStop} size="small" title="停止子代理" onClick={stop} />
        ) : null}
        <ActionIcon
          icon={PanelRightOpen}
          size="small"
          title="在右侧面板打开"
          onClick={openInDock}
        />
        <span className={cx(styles.chev, open && styles.chevOpen)}>
          <Icon icon={ChevronRight} size={16} />
        </span>
      </div>
      {open ? (
        <div className={styles.nested}>
          <SubAgentConversation task={task} result={result} status={effectiveStatus} />
        </div>
      ) : null}
    </div>
  );
}
