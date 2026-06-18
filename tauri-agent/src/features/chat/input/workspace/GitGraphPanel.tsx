import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon, Popover } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Network } from 'lucide-react';
import { VList } from 'virtua';
import { pi, type GitLogEntry } from '../../../../lib/pi';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';
import { wsStyles as s } from './styles';

const LANE_W = 14;
const ROW_H = 30;
const NODE_R = 4;
// lane 配色（按列循环），与主题 accent 一致，纯色无 emoji。
const LANE_COLORS = ['#4c8bf5', '#3fb950', '#d29922', '#bc8cff', '#f778ba', '#56d4dd'];

interface GraphRow {
  commit: GitLogEntry;
  col: number;
  incoming: (string | null)[];
  outgoing: (string | null)[];
  parentCols: number[];
  mergedFrom: number[];
}

/**
 * 基于 parents 做 lane（列）分配：维护「每条 lane 期待出现的下一个 commit」，
 * 第一父接替当前 lane，额外父开新 lane，多个 lane 指向同一 commit 即合并。
 * 产出每行的入/出 lane 快照与分叉/合并列，供 SVG 画竖线 + 斜线。
 */
function buildGraph(log: GitLogEntry[]): { rows: GraphRow[]; lanes: number } {
  const lanes: (string | null)[] = [];
  let maxLanes = 1;

  const rows = log.map((commit) => {
    let col = lanes.findIndex((h) => h === commit.hash);
    if (col === -1) {
      col = lanes.indexOf(null);
      if (col === -1) {
        col = lanes.length;
        lanes.push(null);
      }
    }
    lanes[col] = commit.hash;
    const incoming = lanes.slice();

    const mergedFrom: number[] = [];
    lanes.forEach((h, i) => {
      if (h === commit.hash && i !== col) {
        mergedFrom.push(i);
        lanes[i] = null;
      }
    });

    const parentCols: number[] = [];
    if (commit.parents.length === 0) {
      lanes[col] = null;
    } else {
      commit.parents.forEach((p, idx) => {
        if (idx === 0) {
          lanes[col] = p;
          parentCols.push(col);
          return;
        }
        let pc = lanes.findIndex((h) => h === p);
        if (pc === -1) {
          pc = lanes.indexOf(null);
          if (pc === -1) {
            pc = lanes.length;
            lanes.push(null);
          }
        }
        lanes[pc] = p;
        parentCols.push(pc);
      });
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    const outgoing = lanes.slice();
    maxLanes = Math.max(maxLanes, incoming.length, outgoing.length, col + 1);

    return { commit, col, incoming, outgoing, parentCols, mergedFrom };
  });

  return { rows, lanes: maxLanes };
}

const laneColor = (col: number): string => LANE_COLORS[col % LANE_COLORS.length];
const cx0 = (col: number): number => col * LANE_W + LANE_W / 2;

function RowGraphic({ row, lanes }: { row: GraphRow; lanes: number }) {
  const mid = ROW_H / 2;
  const lines: ReactNode[] = [];

  // 上半：进入本行的各 lane 竖线
  row.incoming.forEach((h, i) => {
    if (h === null) return;
    lines.push(
      <line key={`i${i}`} stroke={laneColor(i)} strokeWidth={1.5} x1={cx0(i)} x2={cx0(i)} y1={0} y2={mid} />,
    );
  });
  // 合并：其它 lane 在中线汇入本 commit 所在列
  row.mergedFrom.forEach((i) => {
    lines.push(
      <line key={`m${i}`} stroke={laneColor(i)} strokeWidth={1.5} x1={cx0(i)} x2={cx0(row.col)} y1={mid} y2={mid} />,
    );
  });
  // 下半：离开本行的各 lane 竖线
  row.outgoing.forEach((h, i) => {
    if (h === null) return;
    lines.push(
      <line key={`o${i}`} stroke={laneColor(i)} strokeWidth={1.5} x1={cx0(i)} x2={cx0(i)} y1={mid} y2={ROW_H} />,
    );
  });
  // 分叉：本 commit 到额外父所在列的斜线
  row.parentCols.forEach((pc) => {
    if (pc === row.col) return;
    lines.push(
      <line key={`p${pc}`} stroke={laneColor(pc)} strokeWidth={1.5} x1={cx0(row.col)} x2={cx0(pc)} y1={mid} y2={ROW_H} />,
    );
  });

  return (
    <svg height={ROW_H} style={{ flex: 'none' }} width={lanes * LANE_W}>
      {lines}
      <circle cx={cx0(row.col)} cy={mid} fill={laneColor(row.col)} r={NODE_R} />
    </svg>
  );
}

const g = createStaticStyles(({ css }) => ({
  list: css`
    scrollbar-width: thin;
    padding: 6px 4px;
  `,
  row: css`
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 0 6px;
  `,
  msg: css`
    overflow: hidden;
    flex: 1;
    font-size: 12.5px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  time: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
  `,
  ref: css`
    margin-right: 6px;
    padding: 1px 6px;
    border-radius: 9px;
    font-size: 10px;
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  refHead: css`
    color: ${cssVar.colorSuccess};
    background: ${cssVar.colorSuccessBg};
  `,
  center: css`
    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 12.5px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

function relTime(ts: number): string {
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86_400)}d`;
}

function GraphView({ workspace }: { workspace: string }) {
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    pi.getGitLogGraph(workspace, 80)
      .then((l) => {
        if (alive) setLog(l);
      })
      .catch(() => {
        if (alive) setLog([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspace]);

  const { rows, lanes } = useMemo(() => buildGraph(log), [log]);

  if (loading) {
    return (
      <div className={g.center} style={{ width: 460, height: 360 }}>
        加载中…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={g.center} style={{ width: 460, height: 360 }}>
        无提交记录
      </div>
    );
  }

  return (
    <VList className={g.list} data={rows} style={{ width: 460, height: 360 }}>
      {(row: GraphRow) => (
        <div key={row.commit.hash} className={g.row} style={{ minHeight: ROW_H }}>
          <RowGraphic lanes={lanes} row={row} />
          <span className={g.msg}>
            {row.commit.refs.map((r) => (
              <span key={r} className={cx(g.ref, /HEAD/.test(r) && g.refHead)}>
                {r}
              </span>
            ))}
            {row.commit.subject}
          </span>
          <span className={g.time}>{relTime(row.commit.timestamp)}</span>
        </div>
      )}
    </VList>
  );
}

/** 「图谱」chip：点开看提交图（lane 连线 + ref 标签 + 相对时间）。懒加载 + 虚拟化。 */
export function GitGraphButton() {
  const { workspace } = useAgentStoreContext();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      arrow={false}
      content={open ? <GraphView workspace={workspace} /> : null}
      open={open}
      placement="topLeft"
      trigger="click"
      onOpenChange={setOpen}
    >
      <span className={s.chip}>
        <Icon icon={Network} size={14} />
        <span className={s.muted}>图谱</span>
      </span>
    </Popover>
  );
}
