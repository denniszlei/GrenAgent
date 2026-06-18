import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Icon, Popover } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx, keyframes } from 'antd-style';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { onPiEvent, pi, type SubAgentItem } from '../../../../lib/pi';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';
import { wsStyles as s } from './styles';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const t = createStaticStyles(({ css }) => ({
  panel: css`
    scrollbar-width: thin;
    overflow-y: auto;

    width: 330px;
    max-height: 360px;
    margin: -4px;
    padding: 4px;
  `,
  task: css`
    display: flex;
    gap: 10px;
    align-items: center;

    padding: 9px 10px;
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  body: css`
    flex: 1;
    min-width: 0;
  `,
  t1: css`
    overflow: hidden;
    font-size: 13px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  t2: css`
    margin-top: 2px;
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  spin: css`
    flex: none;
    color: ${cssVar.colorSuccess};
    animation: ${spin} 1s linear infinite;
  `,
  st: css`
    flex: none;
    padding: 2px 8px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 600;
  `,
}));

const STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  done: '完成',
  error: '失败',
  cancelled: '已取消',
};

function statusColor(status: string): { fg: string; bg: string } {
  if (status === 'running') return { fg: cssVar.colorSuccess, bg: cssVar.colorSuccessBg };
  if (status === 'error') return { fg: cssVar.colorError, bg: cssVar.colorErrorBg };
  return { fg: cssVar.colorTextSecondary, bg: cssVar.colorFillSecondary };
}

function elapsed(from: number, to: number): string {
  const sec = Math.max(0, Math.floor((to - from) / 1000));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

/** 后台任务托盘：复用 subagent_list，列出运行/完成/失败任务，运行中可取消。无任务时不渲染。 */
export function TaskTray() {
  const { workspace } = useAgentStoreContext();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<SubAgentItem[]>([]);

  const load = useCallback(() => {
    pi.subagentList(workspace)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [workspace]);

  const running = tasks.filter((x) => x.status === 'running').length;

  // 挂载先拉一次，并监听 pi 事件（工具/回合变化常意味着子代理启停）即时刷新。
  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    void onPiEvent((e) => {
      if (e.workspace !== workspace) return;
      const ty = e.event.type;
      if (ty === 'tool_execution_start' || ty === 'tool_execution_end' || ty === 'agent_end') {
        load();
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [load, workspace]);

  // 仅在面板打开或有运行中任务时轮询，空闲不轮询，避免常驻定时器。
  useEffect(() => {
    if (!open && running === 0) return;
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [open, running, load]);

  if (tasks.length === 0) return null;

  const now = Date.now();
  const content = (
    <div className={t.panel}>
      {tasks.map((task) => {
        const c = statusColor(task.status);
        const isRun = task.status === 'running';
        const label = STATUS_LABEL[task.status] ?? task.status;
        return (
          <div key={task.id} className={t.task}>
            {isRun ? (
              <Icon className={t.spin} icon={Loader2} size={15} />
            ) : (
              <Icon
                icon={task.status === 'error' ? XCircle : CheckCircle2}
                size={15}
                style={{ color: c.fg, flex: 'none' }}
              />
            )}
            <div className={t.body}>
              <div className={t.t1}>{task.task}</div>
              <div className={t.t2}>
                {task.model ? `${task.model} · ` : ''}
                {isRun ? `已运行 ${elapsed(task.createdAt, now)}` : label}
              </div>
            </div>
            <span className={t.st} style={{ color: c.fg, background: c.bg }}>
              {label}
            </span>
            {isRun ? (
              <ActionIcon
                icon={X}
                size="small"
                title="取消"
                onClick={() => void pi.subagentCancel(workspace, task.id).then(load)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <Popover
      arrow={false}
      content={content}
      open={open}
      placement="topLeft"
      trigger="click"
      onOpenChange={setOpen}
    >
      <span className={s.chip}>
        {running > 0 ? <span className={s.dot} /> : null}
        后台任务
        {running > 0 ? <span className={cx(s.badge, s.badgeRun)}>{running}</span> : null}
      </span>
    </Popover>
  );
}
