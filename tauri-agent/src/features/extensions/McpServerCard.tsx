import { Segmented, Switch } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDown, ChevronRight, PencilLine, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { transportOf, type McpConfig } from './mcpConfig';
import { getToolPerm, shortToolName, type Perm } from './mcpPolicy';

export interface McpLiveStatus {
  status: 'connecting' | 'connected' | 'failed';
  tools: number;
  toolNames?: string[];
}

interface McpServerCardProps {
  name: string;
  config: McpConfig;
  enabled: boolean;
  live?: McpLiveStatus;
  policyRaw?: Record<string, unknown>;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPermChange?: (fullName: string, perm: Perm) => void;
  onOpenRules?: (fullName: string) => void;
}

const PERM_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '需审批', value: 'needs_approval' },
  { label: '禁用', value: 'disabled' },
];

function dotColor(enabled: boolean, live?: McpLiveStatus): string {
  if (!enabled || !live) return '#8a8f98';
  if (live.status === 'connected') return '#3ddc84';
  if (live.status === 'connecting') return '#f5a623';
  return '#f5635b';
}

function statusLabel(enabled: boolean, live?: McpLiveStatus): string {
  if (!enabled) return '已禁用';
  if (!live) return '待连接';
  if (live.status === 'connected') return `${live.tools} 工具`;
  if (live.status === 'connecting') return '连接中…';
  return '连接失败';
}

const styles = createStaticStyles(({ css }) => ({
  wrap: css`
    margin-block-end: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
  `,
  card: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
  `,
  disabled: css`
    opacity: 0.55;
  `,
  expandBtn: css`
    display: inline-flex;
    border: none;
    background: transparent;
    color: ${cssVar.colorTextTertiary};
    cursor: pointer;
  `,
  dot: css`
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
  `,
  name: css`
    font-size: 13px;
    color: ${cssVar.colorText};
  `,
  pill: css`
    padding: 1px 8px;
    border-radius: 6px;
    background: ${cssVar.colorFillTertiary};
    color: ${cssVar.colorTextSecondary};
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    text-transform: uppercase;
  `,
  grow: css`
    flex: 1;
    min-width: 0;
  `,
  status: css`
    font-size: 11px;
  `,
  ops: css`
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  iconbtn: css`
    display: inline-flex;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  `,
  tools: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    padding: 6px 14px 10px;
  `,
  toolRow: css`
    display: flex;
    align-items: center;
    gap: 10px;
    padding-block: 6px;
  `,
  toolName: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  hint: css`
    padding: 8px 0;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

export function McpServerCard({
  name, config, enabled, live, policyRaw = {},
  onToggle, onEdit, onDelete, onPermChange, onOpenRules,
}: McpServerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = dotColor(enabled, live);
  const toolNames = live?.toolNames ?? [];
  return (
    <div className={styles.wrap} data-testid={`mcp-server-${name}`}>
      <div className={`${styles.card} ${enabled ? '' : styles.disabled}`}>
        <button
          type="button"
          className={styles.expandBtn}
          data-testid={`mcp-expand-${name}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <span className={styles.dot} style={{ background: color }} />
        <span className={styles.name}>{name}</span>
        <span className={styles.pill}>{transportOf(config)}</span>
        <span className={styles.grow} />
        <span className={styles.status} style={{ color }}>{statusLabel(enabled, live)}</span>
        <span className={styles.ops}>
          <Switch size="small" checked={enabled} onChange={onToggle} data-testid={`mcp-toggle-${name}`} />
          <button type="button" className={styles.iconbtn} data-testid={`mcp-edit-${name}`} onClick={onEdit}>
            <PencilLine size={15} />
          </button>
          <button type="button" className={styles.iconbtn} data-testid={`mcp-delete-${name}`} onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </span>
      </div>
      {expanded ? (
        <div className={styles.tools}>
          {!enabled || !live || live.status !== 'connected' ? (
            <div className={styles.hint}>连接后可查看并配置工具权限</div>
          ) : toolNames.length === 0 ? (
            <div className={styles.hint}>该 server 无工具</div>
          ) : (
            toolNames.map((full) => (
              <div key={full} className={styles.toolRow} data-testid={`mcp-tool-${full}`}>
                <span className={styles.toolName} title={full}>{shortToolName(full)}</span>
                <Segmented
                  size="small"
                  value={getToolPerm(policyRaw, full)}
                  options={PERM_OPTIONS}
                  onChange={(v) => onPermChange?.(full, v as Perm)}
                  data-testid={`mcp-perm-${full}`}
                />
                <button
                  type="button"
                  className={styles.iconbtn}
                  title="参数规则"
                  data-testid={`mcp-rules-${full}`}
                  onClick={() => onOpenRules?.(full)}
                >
                  <SlidersHorizontal size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
