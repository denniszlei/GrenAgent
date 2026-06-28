import { ActionIcon, Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { BookPlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type KbChunk, type KbSource, type KbStats } from '../../lib/pi';
import { ManagerLayout } from '../common/ManagerLayout';
import { LazyMarkdown } from '../chat/LazyMarkdown';

/**
 * 把文件选择器返回的绝对路径转成喂给 `/kb add` 的路径：在工作区内则转相对路径
 * （source 标签更短、更干净），否则保留绝对路径。统一用正斜杠，跨平台且 Node 的
 * path.resolve/isAbsolute 在 Windows 上同样接受。
 */
export function toWorkspacePath(abs: string, workspace: string): string {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  const a = norm(abs);
  const prefix = `${norm(workspace)}/`;
  return a.toLowerCase().startsWith(prefix.toLowerCase()) ? a.slice(prefix.length) : a;
}

const styles = createStaticStyles(({ css }) => ({
  header: css`
    width: 100%;
    color: ${cssVar.colorTextSecondary};
    font-size: 13px;
  `,
  headerMeta: css`
    color: ${cssVar.colorTextTertiary};
  `,
  empty: css`
    padding: 14px;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  item: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: transparent;
    color: ${cssVar.colorText};
    font-size: 12px;
    text-align: start;
    cursor: pointer;
    transition: background 0.12s ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  itemActive: css`
    background: ${cssVar.colorFillSecondary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  itemName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemCount: css`
    flex: 0 0 auto;
    color: ${cssVar.colorTextTertiary};
  `,
  chunk: css`
    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillQuaternary};
    font-size: 13px;
  `,
  placeholder: css`
    color: ${cssVar.colorTextTertiary};
    font-size: 13px;
  `,
}));

export function KnowledgePanel() {
  const { workspace } = useAgentStoreContext();
  const [stats, setStats] = useState<KbStats | null>(null);
  const [sources, setSources] = useState<KbSource[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [chunks, setChunks] = useState<KbChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    void Promise.all([pi.kbStats(workspace), pi.kbSources(workspace)])
      .then(([s, src]) => {
        setStats(s);
        setSources(src);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspace]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!selected) {
      setChunks([]);
      return;
    }
    let alive = true;
    void pi
      .kbChunks(workspace, selected)
      .then((c) => {
        if (alive) setChunks(c);
      })
      .catch(() => {
        if (alive) setChunks([]);
      });
    return () => {
      alive = false;
    };
  }, [workspace, selected]);

  const onClear = useCallback(async () => {
    if (!window.confirm('确定清空知识库？此操作不可撤销。')) return;
    await pi.runCommand(workspace, '/kb clear');
    setSelected(null);
    reload();
  }, [workspace, reload]);

  const onAdd = useCallback(async () => {
    const picked = await openDialog({ multiple: true, title: '选择要索引到知识库的文件' });
    const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter(Boolean);
    if (paths.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      for (const abs of paths) {
        await pi.runCommand(workspace, `/kb add ${toWorkspacePath(abs, workspace)}`);
      }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [workspace, reload]);

  const header = (
    <Flexbox horizontal align="center" gap={12} className={styles.header} data-testid="kb-header">
      <span>{adding ? '索引中…' : stats ? `${stats.chunks} 块 · ${stats.sources} 文档` : '加载中…'}</span>
      <span className={styles.headerMeta}>{stats?.model ? `embedding: ${stats.model}` : 'keyword 模式'}</span>
      <div style={{ flex: 1 }} />
      <ActionIcon
        data-testid="kb-add"
        disabled={adding}
        icon={BookPlus}
        size="small"
        title="添加文档"
        onClick={() => void onAdd()}
      />
      <ActionIcon data-testid="kb-clear" icon={Trash2} size="small" title="清空知识库" onClick={() => void onClear()} />
    </Flexbox>
  );

  let list: ReactNode;
  if (error) {
    list = <div className={styles.empty}>读取失败：{error}</div>;
  } else if (sources.length === 0) {
    list = (
      <div className={styles.empty} data-testid="kb-empty">
        知识库为空
      </div>
    );
  } else {
    list = (
      <Flexbox>
        {sources.map((s) => {
          const active = s.source === selected;
          return (
            <button
              key={s.source}
              className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
              data-testid={`kb-source-${s.source}`}
              onClick={() => setSelected(s.source)}
            >
              <span className={styles.itemName}>{s.source}</span>
              <span className={styles.itemCount}>{s.chunks}</span>
            </button>
          );
        })}
      </Flexbox>
    );
  }

  const detail = selected ? (
    <Flexbox gap={10} data-testid="kb-detail">
      {chunks.map((c) => (
        <div key={c.id} className={styles.chunk}>
          <LazyMarkdown>{c.text}</LazyMarkdown>
        </div>
      ))}
    </Flexbox>
  ) : (
    <div className={styles.placeholder}>选择左侧文档查看片段</div>
  );

  return <ManagerLayout testId="knowledge-panel" header={header} list={list} detail={detail} />;
}
