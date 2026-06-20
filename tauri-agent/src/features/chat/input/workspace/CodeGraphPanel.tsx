import { useEffect, useMemo, useState } from 'react';
import { Icon, Modal } from '@lobehub/ui';
import { createGlobalStyle, createStaticStyles, cssVar } from 'antd-style';
import { Crosshair, Share2 } from 'lucide-react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getFileGraph, type FileGraph } from '../../../../lib/codeGraphIo';
import { computeForceLayout, topLevelDir } from '../../../../lib/codeGraphLayout';
import { useAgentStoreContext } from '../../../../stores/AgentStoreContext';
import { wsStyles as s } from './styles';

const mono = 'ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace';

// 把容器固定为「视口高 - 32px」并 flex 纵向：标题自动占高、body flex:1 吃满剩余。
// 经 rootClassName 限定作用域；配合 centered 自动留 16px 上下边距，画布被视口约束死不会溢出。
// 注意：antd v6 的容器类名是 .ant-modal-container（非旧版 .ant-modal-content，已实测 DOM 确认）。
// 用 !important 强制覆盖 antd v6 的 CSS-in-JS（其 .ant-modal-body{max-height:75dvh} 在真实浏览器里
// 注入顺序/优先级会压过普通全局规则，导致 body 被卡在 75dvh、容器底部留白；jsdom 里顺序相反故测不出）。
const ModalGlobal = createGlobalStyle`
  .code-graph-modal-root .ant-modal-container {
    height: calc(100vh - 32px) !important;
    max-height: calc(100vh - 32px) !important;
    display: flex !important;
    flex-direction: column !important;
  }
  .code-graph-modal-root .ant-modal-body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  }
`;

function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** 顶层目录 → 稳定色相，让同模块的文件成簇可辨。 */
function dirColor(dir: string): string {
  let h = 0;
  for (let i = 0; i < dir.length; i += 1) h = (h * 31 + dir.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 58%)`;
}

interface Neighbor {
  path: string;
  weight: number;
}

interface GraphBase {
  layout: Map<string, { x: number; y: number }>;
  /** 出边：该文件 import 的文件。 */
  out: Map<string, Neighbor[]>;
  /** 入边：import 该文件的文件。 */
  inc: Map<string, Neighbor[]>;
}

function buildBase(graph: FileGraph): GraphBase {
  const ids = new Set(graph.nodes.map((n) => n.path));
  const layout = computeForceLayout(graph);
  const out = new Map<string, Neighbor[]>();
  const inc = new Map<string, Neighbor[]>();
  const push = (m: Map<string, Neighbor[]>, key: string, n: Neighbor) => {
    const arr = m.get(key);
    if (arr) arr.push(n);
    else m.set(key, [n]);
  };
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    push(out, e.source, { path: e.target, weight: e.weight });
    push(inc, e.target, { path: e.source, weight: e.weight });
  }
  return { layout, out, inc };
}

const styles = createStaticStyles(({ css }) => ({
  body: css`
    display: flex;
    flex-direction: column;
    /* 填满 Modal body（其高度由 .ant-modal-content 经 flex 约束到视口内）。 */
    height: 100%;
    min-height: 0;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    margin-block-end: 8px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  main: css`
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 10px;
  `,
  canvas: css`
    flex: 1;
    min-width: 0;
    min-height: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    overflow: hidden;
    background: ${cssVar.colorBgLayout};

    /* 非可连线图：隐藏 reactflow 默认 source/target 手柄圆点。 */
    .react-flow__handle {
      opacity: 0;
      pointer-events: none;
    }

    /* 控制按钮在深色下默认白底白字看不清：改深底浅字。 */
    .react-flow__controls {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    }
    .react-flow__controls-button {
      background: ${cssVar.colorBgElevated};
      border-bottom: 1px solid ${cssVar.colorBorderSecondary};
      color: ${cssVar.colorText};
    }
    .react-flow__controls-button:hover {
      background: ${cssVar.colorFillSecondary};
    }
    .react-flow__controls-button svg {
      fill: ${cssVar.colorText};
    }
  `,
  side: css`
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
  `,
  sideHead: css`
    flex: 0 0 auto;
    padding: 10px 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  sideTitle: css`
    font-size: 12.5px;
    font-weight: 600;
    color: ${cssVar.colorText};
    word-break: break-all;
    font-family: ${mono};
  `,
  sidePath: css`
    margin-block-start: 3px;
    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    word-break: break-all;
  `,
  sideMetaRow: css`
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-start: 8px;
  `,
  focusBtn: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 7px;
    background: ${cssVar.colorFillTertiary};
    color: ${cssVar.colorText};
    font-size: 11.5px;
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  sideBody: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding: 6px 8px 12px;
  `,
  group: css`
    margin-block-start: 8px;
    font-size: 11px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: ${cssVar.colorTextTertiary};
    padding: 4px 6px;
  `,
  item: css`
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillTertiary};
      color: ${cssVar.colorText};
    }
  `,
  itemName: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ${mono};
  `,
  dot: css`
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 2px;
  `,
  hint: css`
    padding: 16px 10px;
    font-size: 12px;
    line-height: 1.6;
    color: ${cssVar.colorTextTertiary};
  `,
  center: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

function NodeList({
  title,
  items,
  onPick,
}: {
  title: string;
  items: Neighbor[];
  onPick: (path: string) => void;
}) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  return (
    <>
      <div className={styles.group}>
        {title}（{items.length}）
      </div>
      {sorted.map((it) => (
        <div key={it.path} className={styles.item} title={it.path} onClick={() => onPick(it.path)}>
          <span className={styles.dot} style={{ background: dirColor(topLevelDir(it.path)) }} />
          <span className={styles.itemName}>{basename(it.path)}</span>
        </div>
      ))}
    </>
  );
}

function GraphContent({ workspace }: { workspace: string }) {
  const [graph, setGraph] = useState<FileGraph | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getFileGraph(workspace)
      .then((g) => {
        if (alive) setGraph(g);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [workspace]);

  // 布局 + 邻接只随 graph 变（选中不重算，保证位置稳定）。
  const base = useMemo(() => (graph ? buildBase(graph) : null), [graph]);

  const neighborSet = useMemo(() => {
    if (!base || !selected) return null;
    const set = new Set<string>([selected]);
    for (const n of base.out.get(selected) ?? []) set.add(n.path);
    for (const n of base.inc.get(selected) ?? []) set.add(n.path);
    return set;
  }, [base, selected]);

  const flow = useMemo(() => {
    if (!graph || !base) return { nodes: [] as Node[], edges: [] as Edge[] };
    const dim = (id: string) => neighborSet != null && !neighborSet.has(id);
    const nodes: Node[] = graph.nodes.map((n) => {
      const pos = base.layout.get(n.path) ?? { x: 0, y: 0 };
      const color = dirColor(topLevelDir(n.path));
      const isSel = n.path === selected;
      const faded = dim(n.path);
      return {
        id: n.path,
        position: pos,
        data: { label: basename(n.path) },
        // 内联样式压过 reactflow 默认白底节点：深底浅字 + 目录色描边。
        style: {
          background: isSel ? cssVar.colorFillSecondary : cssVar.colorBgElevated,
          color: cssVar.colorText,
          border: `1px solid ${isSel ? cssVar.colorPrimary : color}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 8,
          padding: '4px 9px',
          fontSize: 11,
          fontFamily: mono,
          maxWidth: 168,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: isSel ? `0 0 0 2px ${cssVar.colorPrimary}` : undefined,
          opacity: faded ? 0.12 : 1,
        },
      } as Node;
    });
    const edges: Edge[] = graph.edges
      .filter((e) => base.layout.has(e.source) && base.layout.has(e.target))
      .map((e) => {
        const touchesSel = selected != null && (e.source === selected || e.target === selected);
        const baseW = Math.min(1 + Math.log2(e.weight + 1) * 0.5, 3.5);
        return {
          id: `${e.source}=>${e.target}`,
          source: e.source,
          target: e.target,
          style: {
            stroke: touchesSel ? cssVar.colorPrimary : '#6b7280',
            strokeOpacity: selected == null ? 0.28 : touchesSel ? 0.85 : 0.04,
            strokeWidth: touchesSel ? baseW + 0.8 : baseW,
          },
        };
      });
    return { nodes, edges };
  }, [graph, base, selected, neighborSet]);

  const focusNeighborhood = () => {
    if (!rf || !neighborSet) return;
    rf.fitView({
      nodes: Array.from(neighborSet).map((id) => ({ id })),
      padding: 0.4,
      duration: 400,
    });
  };

  // 选中即自动聚焦邻域，解决「只能看全览」。
  useEffect(() => {
    if (rf && neighborSet) {
      rf.fitView({
        nodes: Array.from(neighborSet).map((id) => ({ id })),
        padding: 0.4,
        duration: 400,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (loading) return <div className={styles.center}>加载依赖图中…</div>;
  if (error) return <div className={styles.center} data-testid="code-graph-error">{error}</div>;
  if (!graph || flow.nodes.length === 0) {
    return <div className={styles.center}>未发现文件间 import 依赖（或索引为空）</div>;
  }

  const outList = (selected && base?.out.get(selected)) || [];
  const incList = (selected && base?.inc.get(selected)) || [];

  return (
    <div className={styles.body} data-testid="code-graph-content">
      <div className={styles.toolbar} data-testid="code-graph-stats">
        {flow.nodes.length} 个文件 · {flow.edges.length} 条依赖 · 颜色＝顶层目录 · 点文件看上下游
      </div>
      <div className={styles.main}>
        <div className={styles.canvas}>
          <ReactFlow
            nodes={flow.nodes}
            edges={flow.edges}
            onInit={setRf}
            onNodeClick={(_, node) => setSelected(node.id)}
            onPaneClick={() => setSelected(null)}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.05}
            nodesConnectable={false}
            edgesFocusable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={28} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeStrokeWidth={2}
              nodeColor={(node) => dirColor(topLevelDir(String(node.id)))}
              maskColor="rgba(0, 0, 0, 0.55)"
              style={{ backgroundColor: '#0e1116', border: `1px solid ${cssVar.colorBorderSecondary}` }}
            />
          </ReactFlow>
        </div>
        <div className={styles.side} data-testid="code-graph-side">
          {selected ? (
            <>
              <div className={styles.sideHead}>
                <div className={styles.sideTitle}>{basename(selected)}</div>
                <div className={styles.sidePath}>{selected}</div>
                <div className={styles.sideMetaRow}>
                  <span style={{ fontSize: 11.5, color: cssVar.colorTextTertiary }}>
                    依赖 {outList.length} · 被依赖 {incList.length}
                  </span>
                  <button type="button" className={styles.focusBtn} onClick={focusNeighborhood}>
                    <Icon icon={Crosshair} size={12} />
                    聚焦
                  </button>
                </div>
              </div>
              <div className={styles.sideBody}>
                <NodeList title="依赖（它 import）" items={outList} onPick={setSelected} />
                <NodeList title="被依赖（import 它）" items={incList} onPick={setSelected} />
                {outList.length === 0 && incList.length === 0 ? (
                  <div className={styles.hint}>该文件无 import 关系。</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className={styles.hint}>
              点击任意文件节点：高亮其依赖（它 import 的）与被依赖（import 它的），并自动聚焦邻域；右侧列出上下游、可点击跳转。点空白处取消。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 「代码图谱」chip：点开看当前 workspace 的文件 import 依赖图（reactflow，可拖拽缩放 + 点选下钻）。 */
export function CodeGraphButton() {
  const { workspace } = useAgentStoreContext();
  const [open, setOpen] = useState(false);

  if (!workspace) return null;

  return (
    <>
      <ModalGlobal />
      <span className={s.chip} data-testid="code-graph-button" onClick={() => setOpen(true)}>
        <Icon icon={Share2} size={14} />
        <span className={s.muted}>代码图谱</span>
      </span>
      <Modal
        open={open}
        title="代码图谱 · 文件依赖"
        footer={null}
        width="94vw"
        centered
        rootClassName="code-graph-modal-root"
        onCancel={() => setOpen(false)}
        data-testid="code-graph-modal"
      >
        {open ? <GraphContent workspace={workspace} /> : null}
      </Modal>
    </>
  );
}
