import { useEffect, useState } from 'react';
import { Icon, Popover } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { FileDiff } from 'lucide-react';
import { VList } from 'virtua';
import { pi, type GitFileStatus } from '../../../../lib/pi';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';
import { useGitInfo, useGitStore } from '../../../../stores/gitStore';
import { wsStyles as s } from './styles';

const STATUS_META: Record<string, { tag: string; color: string; bg: string }> = {
  modified: { tag: 'M', color: cssVar.colorWarning, bg: cssVar.colorWarningBg },
  staged: { tag: 'A', color: cssVar.colorSuccess, bg: cssVar.colorSuccessBg },
  untracked: { tag: 'U', color: cssVar.colorTextSecondary, bg: cssVar.colorFillSecondary },
};

const d = createStaticStyles(({ css }) => ({
  wrap: css`
    display: grid;
    grid-template-columns: 168px 1fr;

    width: 560px;
    height: 320px;
    margin: -4px;
  `,
  files: css`
    scrollbar-width: thin;
    overflow-y: auto;
    padding: 4px;
    border-right: 1px solid ${cssVar.colorBorderSecondary};
  `,
  file: css`
    display: flex;
    gap: 7px;
    align-items: center;

    padding: 6px 8px;
    border-radius: 6px;

    font-size: 12.5px;
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  fileSel: css`
    background: ${cssVar.colorFillSecondary};
  `,
  fn: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  tag: css`
    flex: none;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  `,
  diff: css`
    scrollbar-width: thin;

    padding: 8px 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    line-height: 1.7;
  `,
  line: css`
    padding: 0 12px;
    white-space: pre;
  `,
  add: css`
    color: ${cssVar.colorSuccess};
    background: ${cssVar.colorSuccessBg};
  `,
  del: css`
    color: ${cssVar.colorError};
    background: ${cssVar.colorErrorBg};
  `,
  hunk: css`
    color: ${cssVar.colorTextTertiary};
  `,
  meta: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  center: css`
    display: flex;
    align-items: center;
    justify-content: center;

    height: 100%;

    font-size: 12.5px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

function lineClass(line: string): string | undefined {
  if (
    line.startsWith('+++') ||
    line.startsWith('---') ||
    line.startsWith('diff ') ||
    line.startsWith('index ')
  )
    return d.meta;
  if (line.startsWith('@@')) return d.hunk;
  if (line.startsWith('+')) return d.add;
  if (line.startsWith('-')) return d.del;
  return undefined;
}

function DiffView({ workspace }: { workspace: string }) {
  const git = useGitInfo(workspace);
  const [sel, setSel] = useState<string | null>(git.changes[0]?.path ?? null);
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sel) {
      setDiff('');
      return;
    }
    let alive = true;
    setLoading(true);
    pi.getGitDiff(workspace, sel)
      .then((text) => {
        if (alive) setDiff(text);
      })
      .catch(() => {
        if (alive) setDiff('');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspace, sel]);

  const lines = diff ? diff.split('\n') : [];

  return (
    <div className={d.wrap}>
      <div className={d.files}>
        {git.changes.map((f: GitFileStatus) => {
          const meta = STATUS_META[f.status] ?? {
            tag: 'M',
            color: cssVar.colorWarning,
            bg: cssVar.colorWarningBg,
          };
          return (
            <div
              key={f.path}
              className={cx(d.file, f.path === sel && d.fileSel)}
              title={f.path}
              onClick={() => setSel(f.path)}
            >
              <span className={d.tag} style={{ color: meta.color, background: meta.bg }}>
                {meta.tag}
              </span>
              <span className={d.fn}>{f.path}</span>
            </div>
          );
        })}
      </div>
      {loading ? (
        <div className={d.center}>加载中…</div>
      ) : lines.length === 0 ? (
        <div className={d.center}>未跟踪或无文本 diff</div>
      ) : (
        <VList className={d.diff} data={lines} style={{ height: '100%' }}>
          {(ln: string, i: number) => (
            <div key={i} className={cx(d.line, lineClass(ln))}>
              {ln || ' '}
            </div>
          )}
        </VList>
      )}
    </div>
  );
}

/** 「N 改动」chip：点开看改动文件列表 + 行级 diff。无改动时不渲染。 */
export function ChangesButton() {
  const { workspace } = useAgentStoreContext();
  const git = useGitInfo(workspace);
  const [open, setOpen] = useState(false);

  const n = git.changes.length;
  if (n === 0) return null;

  return (
    <Popover
      arrow={false}
      content={<DiffView workspace={workspace} />}
      open={open}
      placement="topLeft"
      trigger="click"
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void useGitStore.getState().load(workspace, true);
      }}
    >
      <span className={s.chip}>
        <Icon icon={FileDiff} size={14} />
        <span className={s.muted}>{n} 改动</span>
      </span>
    </Popover>
  );
}
