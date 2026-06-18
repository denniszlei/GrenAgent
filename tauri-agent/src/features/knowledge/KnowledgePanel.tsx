import { ActionIcon, Flexbox } from '@lobehub/ui';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { BookPlus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type KbChunk, type KbSource, type KbStats } from '../../lib/pi';
import { ManagerLayout } from '../common/ManagerLayout';
import { LazyMarkdown } from '../chat/LazyMarkdown';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

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
    <Flexbox horizontal align="center" gap={12} data-testid="kb-header" style={{ fontSize: 13, width: '100%' }}>
      <span>{adding ? '索引中…' : stats ? `${stats.chunks} 块 · ${stats.sources} 文档` : '加载中…'}</span>
      <span style={{ color: muted }}>{stats?.model ? `embedding: ${stats.model}` : 'keyword 模式'}</span>
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
    list = <div style={{ padding: 14, fontSize: 12, color: muted }}>读取失败：{error}</div>;
  } else if (sources.length === 0) {
    list = (
      <div data-testid="kb-empty" style={{ padding: 14, fontSize: 12, color: muted }}>
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
              data-testid={`kb-source-${s.source}`}
              onClick={() => setSelected(s.source)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                border: 'none',
                borderBottom: border,
                cursor: 'pointer',
                textAlign: 'left',
                background: active ? 'var(--gren-rail-active, rgba(255,255,255,0.08))' : 'transparent',
                color: active ? 'var(--gren-fg, inherit)' : 'inherit',
                fontSize: 12,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.source}
              </span>
              <span style={{ color: muted, flex: '0 0 auto' }}>{s.chunks}</span>
            </button>
          );
        })}
      </Flexbox>
    );
  }

  const detail = selected ? (
    <Flexbox gap={10} data-testid="kb-detail">
      {chunks.map((c) => (
        <div key={c.id} style={{ border, borderRadius: 8, padding: 10, fontSize: 13 }}>
          <LazyMarkdown>{c.text}</LazyMarkdown>
        </div>
      ))}
    </Flexbox>
  ) : (
    <div style={{ color: muted, fontSize: 13 }}>选择左侧文档查看片段</div>
  );

  return <ManagerLayout testId="knowledge-panel" header={header} list={list} detail={detail} />;
}
