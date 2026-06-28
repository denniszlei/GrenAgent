import { ActionIcon, Button, Flexbox, Input, Modal, Segmented, TextArea } from '@lobehub/ui';
import { Popconfirm } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowUp, Eraser, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi, type MemItem, type MemStats } from '../../lib/pi';
import { ManagerLayout } from '../common/ManagerLayout';
import { MemoryHistory } from './MemoryHistory';

type ScopeFilter = 'all' | 'project' | 'global';
const FILTERS: { id: ScopeFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'project', label: '项目' },
  { id: 'global', label: '全局' },
];

const styles = createStaticStyles(({ css }) => ({
  header: css`
    width: 100%;
    color: ${cssVar.colorTextSecondary};
    font-size: 13px;
  `,
  stats: css`
    color: ${cssVar.colorTextTertiary};
  `,
  empty: css`
    padding: 14px;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  item: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
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
  itemText: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemMeta: css`
    color: ${cssVar.colorTextTertiary};
    font-size: 11px;
  `,
  detailText: css`
    color: ${cssVar.colorText};
    font-size: 14px;
    line-height: 1.6;
  `,
  detailMeta: css`
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  sectionTitle: css`
    margin-block-start: 8px;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  placeholder: css`
    color: ${cssVar.colorTextTertiary};
    font-size: 13px;
  `,
}));

function formatTime(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export function MemoryPanel() {
  const { workspace } = useAgentStoreContext();
  const [stats, setStats] = useState<MemStats | null>(null);
  const [items, setItems] = useState<MemItem[]>([]);
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [view, setView] = useState<'memories' | 'history'>('memories');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; id?: string } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftCat, setDraftCat] = useState('');
  const [saving, setSaving] = useState(false);
  // bump 后强制 MemoryHistory 重新拉取（清空历史后刷新时间线）。
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const reload = useCallback(() => {
    setError(null);
    void Promise.all([pi.memStats(workspace), pi.memList(workspace)])
      .then(([s, list]) => {
        setStats(s);
        setItems(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [workspace]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((m) => m.scope === filter)),
    [items, filter],
  );
  const selected = useMemo(
    () => filtered.find((m) => `${m.scope}:${m.id}` === selectedKey) ?? null,
    [filtered, selectedKey],
  );

  // 确认交给气泡（Popconfirm），与单条删除一致；这里只负责执行清空。
  const onClear = useCallback(async () => {
    const scope = filter === 'all' ? 'all' : filter;
    await pi.runCommand(workspace, `/memory clear ${scope}`);
    setSelectedKey(null);
    reload();
  }, [workspace, filter, reload]);

  const clearLabel = filter === 'all' ? '全部' : filter === 'project' ? '项目' : '全局';

  // 清空变更历史（memory_history），按当前筛选 scope；只清审计流水，不动记忆条目。
  const onClearHistory = useCallback(async () => {
    const scope = filter === 'all' ? 'all' : filter;
    await pi.runCommand(workspace, `/memory history-clear ${scope}`);
    setHistoryRefresh((n) => n + 1);
  }, [workspace, filter]);

  const onDelete = useCallback(async () => {
    if (!selected) return;
    await pi.runCommand(workspace, `/memory forget ${selected.id}`);
    setSelectedKey(null);
    reload();
  }, [workspace, selected, reload]);

  const onAdd = useCallback(() => {
    setDraftText('');
    setDraftCat('');
    setEditor({ mode: 'add' });
  }, []);

  const onPromote = useCallback(async () => {
    if (!selected || selected.scope !== 'project') return;
    await pi.runCommand(workspace, `/memory promote ${selected.id}`);
    setSelectedKey(null);
    reload();
  }, [workspace, selected, reload]);

  const onEdit = useCallback(() => {
    if (!selected) return;
    setDraftText(selected.text);
    setDraftCat(selected.category ?? '');
    setEditor({ mode: 'edit', id: selected.id });
  }, [selected]);

  // category 取首段（约定单段）；留空 -> none 清除分类。
  const onSubmitEditor = useCallback(async () => {
    const text = draftText.trim();
    if (!text || !editor) return;
    setSaving(true);
    try {
      if (editor.mode === 'add') {
        await pi.runCommand(workspace, `/memory add ${text}`);
      } else {
        const c = draftCat.trim().split(/\s+/)[0] ?? '';
        await pi.runCommand(
          workspace,
          `/memory edit ${editor.id} --cat ${c === '' ? 'none' : c} ${text}`,
        );
      }
      setEditor(null);
      setSelectedKey(null);
      reload();
    } finally {
      setSaving(false);
    }
  }, [draftText, draftCat, editor, workspace, reload]);

  const header = (
    <Flexbox horizontal align="center" gap={12} className={styles.header} data-testid="mem-header">
      <span className={styles.stats}>
        {stats ? `项目 ${stats.project} · 全局 ${stats.global}` : '加载中…'}
      </span>
      <Segmented
        size="small"
        value={filter}
        onChange={(v) => setFilter(v as ScopeFilter)}
        options={FILTERS.map((f) => ({
          label: <span data-testid={`mem-filter-${f.id}`}>{f.label}</span>,
          value: f.id,
        }))}
      />
      <Segmented
        size="small"
        value={view}
        onChange={(v) => setView(v as 'memories' | 'history')}
        options={[
          { label: <span data-testid="mem-view-memories">记忆</span>, value: 'memories' },
          { label: <span data-testid="mem-view-history">历史</span>, value: 'history' },
        ]}
      />
      <div style={{ flex: 1 }} />
      <ActionIcon data-testid="mem-add" icon={Plus} size="small" title="手动添加" onClick={() => void onAdd()} />
      <Popconfirm
        cancelText="取消"
        okButtonProps={{ 'data-testid': 'mem-clear-confirm', danger: true }}
        okText="清空"
        title={`确定清空${clearLabel}记忆？`}
        onConfirm={() => void onClear()}
      >
        <ActionIcon data-testid="mem-clear" icon={Trash2} size="small" title="清空记忆（按当前筛选）" />
      </Popconfirm>
      {view === 'history' && (
        <Popconfirm
          cancelText="取消"
          okButtonProps={{ 'data-testid': 'mem-history-clear-confirm', danger: true }}
          okText="清空"
          title={`确定清空${clearLabel}变更历史？`}
          onConfirm={() => void onClearHistory()}
        >
          <ActionIcon data-testid="mem-history-clear" icon={Eraser} size="small" title="清空历史（按当前筛选）" />
        </Popconfirm>
      )}
    </Flexbox>
  );

  let list: ReactNode;
  if (error) {
    list = <div className={styles.empty}>读取失败：{error}</div>;
  } else if (filtered.length === 0) {
    list = (
      <div className={styles.empty} data-testid="mem-empty">
        暂无记忆
      </div>
    );
  } else {
    list = (
      <Flexbox>
        {filtered.map((m) => {
          const key = `${m.scope}:${m.id}`;
          const active = key === selectedKey;
          return (
            <button
              key={key}
              className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
              data-testid={`mem-item-${m.scope}-${m.id}`}
              onClick={() => setSelectedKey(key)}
            >
              <span className={styles.itemText}>{m.text}</span>
              <span className={styles.itemMeta}>
                {m.scope === 'global' ? '全局' : '项目'}
                {m.category ? ` · ${m.category}` : ''}
              </span>
            </button>
          );
        })}
      </Flexbox>
    );
  }

  const detail = selected ? (
    <Flexbox gap={10} data-testid="mem-detail">
      <div className={styles.detailText}>{selected.text}</div>
      <Flexbox gap={4} className={styles.detailMeta}>
        <span>scope：{selected.scope === 'global' ? '全局' : '项目'}</span>
        <span>category：{selected.category ?? '（无）'}</span>
        <span>时间：{formatTime(selected.createdAt)}</span>
      </Flexbox>
      <Flexbox horizontal gap={6}>
        {selected.scope === 'project' && (
          <ActionIcon
            data-testid="mem-promote"
            icon={ArrowUp}
            size="small"
            title="提升为全局"
            onClick={() => void onPromote()}
          />
        )}
        <ActionIcon
          data-testid="mem-edit"
          icon={PencilLine}
          size="small"
          title="修改此记忆"
          onClick={() => void onEdit()}
        />
        <Popconfirm
          cancelText="取消"
          okButtonProps={{ 'data-testid': 'mem-delete-confirm', danger: true }}
          okText="删除"
          title="删除此记忆？"
          onConfirm={() => void onDelete()}
        >
          <ActionIcon data-testid="mem-delete" icon={Trash2} size="small" title="删除此记忆" />
        </Popconfirm>
      </Flexbox>
      <div className={styles.sectionTitle}>版本历史</div>
      <MemoryHistory memoryId={selected.id} />
    </Flexbox>
  ) : (
    <div className={styles.placeholder}>选择左侧记忆查看详情</div>
  );

  const editorModal = (
    <Modal
      footer={
        <Flexbox horizontal gap={8} justify="flex-end">
          <Button data-testid="mem-editor-cancel" onClick={() => setEditor(null)}>
            取消
          </Button>
          <Button
            data-testid="mem-editor-ok"
            loading={saving}
            type="primary"
            onClick={() => void onSubmitEditor()}
          >
            确定
          </Button>
        </Flexbox>
      }
      open={!!editor}
      title={editor?.mode === 'add' ? '添加记忆' : '修改记忆'}
      onCancel={() => setEditor(null)}
    >
      <Flexbox gap={12}>
        <TextArea
          autoFocus
          placeholder="记忆内容"
          rows={4}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
        />
        {editor?.mode === 'edit' && (
          <Input
            placeholder="分类（留空清除，单个词）"
            value={draftCat}
            onChange={(e) => setDraftCat(e.target.value)}
          />
        )}
      </Flexbox>
    </Modal>
  );

  if (view === 'history') {
    return (
      <>
        <ManagerLayout
          testId="memory-panel"
          header={header}
          list={<MemoryHistory refreshToken={historyRefresh} />}
          detail={
            <div className={styles.placeholder}>
              全量变更时间线；点条目右侧可回滚，或用上方「清空历史」按当前筛选清空
            </div>
          }
        />
        {editorModal}
      </>
    );
  }
  return (
    <>
      <ManagerLayout testId="memory-panel" header={header} list={list} detail={detail} />
      {editorModal}
    </>
  );
}
