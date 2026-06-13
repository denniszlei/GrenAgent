import { ActionIcon, Flexbox } from '@lobehub/ui';
import { openPath } from '@tauri-apps/plugin-opener';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type ImageItem } from '../../lib/pi';
import { ManagerLayout } from '../common/ManagerLayout';

const muted = 'var(--gren-fg-muted, #9aa1ac)';
const border = '1px solid var(--gren-border, rgba(255,255,255,0.08))';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function CreatePanel() {
  const { workspace } = useAgentStoreContext();
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    void pi
      .createList(workspace)
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [workspace]);

  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    let alive = true;
    setPreview(null);
    void pi
      .createImage(workspace, selected)
      .then((b64) => {
        if (alive) setPreview(`data:image/png;base64,${b64}`);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [workspace, selected]);

  const header = (
    <Flexbox horizontal align="center" gap={12} data-testid="cr-header" style={{ fontSize: 13 }}>
      <span>{items.length} 张图片</span>
    </Flexbox>
  );

  let list: ReactNode;
  if (error) {
    list = <div style={{ padding: 14, fontSize: 12, color: muted }}>读取失败：{error}</div>;
  } else if (items.length === 0) {
    list = (
      <div data-testid="cr-empty" style={{ padding: 14, fontSize: 12, color: muted }}>
        暂无生成的图片
      </div>
    );
  } else {
    list = (
      <Flexbox>
        {items.map((it) => {
          const active = it.name === selected;
          return (
            <button
              key={it.name}
              data-testid={`cr-item-${it.name}`}
              onClick={() => setSelected(it.name)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '8px 12px',
                border: 'none',
                borderBottom: border,
                cursor: 'pointer',
                textAlign: 'left',
                background: active
                  ? 'var(--gren-rail-active, rgba(255,255,255,0.08))'
                  : 'transparent',
                color: 'inherit',
                fontSize: 12,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.name}
              </span>
              <span style={{ color: muted, fontSize: 11 }}>{formatBytes(it.bytes)}</span>
            </button>
          );
        })}
      </Flexbox>
    );
  }

  const detail = selected ? (
    <Flexbox gap={10} data-testid="cr-detail">
      <Flexbox horizontal align="center" gap={8}>
        <span style={{ fontSize: 13 }}>{selected}</span>
        <ActionIcon
          data-testid="cr-open"
          icon={ExternalLink}
          size="small"
          title="打开原图"
          onClick={() => void openPath(selected)}
        />
      </Flexbox>
      {preview ? (
        <img
          data-testid="cr-preview"
          src={preview}
          alt={selected}
          style={{ maxWidth: '100%', borderRadius: 8, border }}
        />
      ) : (
        <div style={{ color: muted, fontSize: 12 }}>加载预览…</div>
      )}
    </Flexbox>
  ) : (
    <div style={{ color: muted, fontSize: 13 }}>选择左侧图片查看预览</div>
  );

  return <ManagerLayout testId="create-panel" header={header} list={list} detail={detail} />;
}
