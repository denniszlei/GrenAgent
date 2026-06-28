import { ActionIcon, Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type MemHistoryItem } from '../../lib/pi';

const opColor: Record<string, string> = {
  ADD: cssVar.colorSuccess,
  UPDATE: cssVar.colorWarning,
  DELETE: cssVar.colorError,
  ROLLBACK: cssVar.colorInfo,
};

const styles = createStaticStyles(({ css }) => ({
  empty: css`
    padding: 14px;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  row: css`
    padding: 8px 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    font-size: 12px;
    transition: background 0.12s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  op: css`
    min-width: 64px;
    font-weight: 600;
  `,
  diff: css`
    overflow: hidden;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  meta: css`
    color: ${cssVar.colorTextTertiary};
    font-size: 11px;
  `,
}));

interface MemoryHistoryProps {
  /** 仅看某条记忆的版本史；不传＝全量时间线。 */
  memoryId?: string;
  /** 外部 bump 此值可强制重新拉取（如清空历史后刷新）。 */
  refreshToken?: number;
}

export function MemoryHistory({ memoryId, refreshToken }: MemoryHistoryProps) {
  const { workspace } = useAgentStoreContext();
  const [rows, setRows] = useState<MemHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    void pi
      .memHistory(workspace, memoryId)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspace, memoryId]);

  useEffect(() => reload(), [reload, refreshToken]);

  const onRollback = useCallback(
    async (historyId: number, scope: string) => {
      if (!window.confirm(`回滚变更 #${historyId}？`)) return;
      // 必须带 scope：项目/全局两库 historyId 会撞号，不带 scope 会回滚错库（表现为「点了没反应」）。
      await pi.runCommand(workspace, `/memory rollback ${historyId} ${scope}`);
      reload();
    },
    [workspace, reload],
  );

  if (error) return <div className={styles.empty}>读取失败：{error}</div>;
  if (rows.length === 0)
    return (
      <div className={styles.empty} data-testid="mem-hist-empty">
        暂无变更历史
      </div>
    );

  return (
    <Flexbox data-testid="mem-history">
      {rows.map((r) => (
        <Flexbox
          key={r.historyId}
          horizontal
          align="center"
          gap={8}
          className={styles.row}
          data-testid={`mem-hist-${r.historyId}`}
        >
          <span className={styles.op} style={{ color: opColor[r.op] ?? cssVar.colorTextTertiary }}>
            {r.op}
          </span>
          <Flexbox style={{ flex: 1, minWidth: 0 }}>
            <span className={styles.diff}>{(r.oldText ?? '∅') + ' → ' + (r.newText ?? '∅')}</span>
            <span className={styles.meta}>
              {r.scope} · v{r.version}
              {r.reason ? ` · ${r.reason}` : ''}
            </span>
          </Flexbox>
          <ActionIcon
            data-testid={`mem-hist-rollback-${r.historyId}`}
            icon={Undo2}
            size="small"
            title="回滚此次变更"
            onClick={() => void onRollback(r.historyId, r.scope)}
          />
        </Flexbox>
      ))}
    </Flexbox>
  );
}
