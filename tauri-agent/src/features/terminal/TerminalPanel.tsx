import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx, useTheme } from 'antd-style';
import { Plus, X } from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { TITLE_BAR_HEIGHT } from '../../components/Titlebar';
import { HEADER_HEIGHT } from '../../components/PanelHeader';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { terminal } from '../../lib/terminal';

type TerminalStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error';

type AppTheme = ReturnType<typeof useTheme>;

interface TerminalTab {
  id: string;
  title: string;
  shellId?: string;
  status: TerminalStatus;
}

interface Disposable {
  dispose: () => void;
}

function createTabModel(index: number): TerminalTab {
  return {
    id: `terminal-${Date.now()}-${index}`,
    status: 'idle',
    title: defaultTerminalTitle(),
  };
}

function defaultTerminalTitle(): string {
  if (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent)) {
    return 'PowerShell';
  }
  return 'Terminal';
}

/** 限制拖拽浮层留在窗口内，且顶部不越过 titlebar。 */
const restrictToWindowBelowTitlebar: Modifier = ({ transform, draggingNodeRect, windowRect }) => {
  if (!draggingNodeRect || !windowRect) return transform;
  const value = { ...transform };

  if (draggingNodeRect.top + value.y < TITLE_BAR_HEIGHT) {
    value.y = TITLE_BAR_HEIGHT - draggingNodeRect.top;
  } else if (draggingNodeRect.bottom + value.y > windowRect.height) {
    value.y = windowRect.height - draggingNodeRect.bottom;
  }

  if (draggingNodeRect.left + value.x < 0) {
    value.x = -draggingNodeRect.left;
  } else if (draggingNodeRect.right + value.x > windowRect.width) {
    value.x = windowRect.width - draggingNodeRect.right;
  }

  return value;
};

/** 拖拽浮层 portal 到 body，脱离主题容器作用域，状态点颜色需用解析后的 token 值。 */
function statusDotColor(theme: AppTheme, status: TerminalStatus): string {
  switch (status) {
    case 'running':
      return theme.colorSuccess;
    case 'starting':
      return theme.colorWarning;
    case 'error':
    case 'exited':
      return theme.colorError;
    default:
      return theme.colorTextQuaternary;
  }
}

const styles = createStaticStyles(({ css }) => ({
  container: css`
    height: 100%;
    min-height: 0;
    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: ${HEADER_HEIGHT}px;
    padding: 0 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorBgElevated};
  `,
  tabs: css`
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
  tab: css`
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 180px;
    height: 28px;
    padding: 0 4px 0 12px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: ${cssVar.colorTextSecondary};
    font-size: 12px;
    cursor: grab;
    user-select: none;
    touch-action: none;
    outline: none;

    &:active {
      cursor: grabbing;
    }

    &:focus,
    &:focus-visible {
      outline: none;
    }

    &:hover {
      background: ${cssVar.colorFillTertiary};
      color: ${cssVar.colorText};
    }
  `,
  tabActive: css`
    border-color: ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFill};
    color: ${cssVar.colorText};
  `,
  tabTitle: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  tabClose: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: ${cssVar.colorTextTertiary};
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillSecondary};
      color: ${cssVar.colorText};
    }
  `,
  statusDot: css`
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: ${cssVar.colorTextQuaternary};
  `,
  statusRunning: css`
    background: ${cssVar.colorSuccess};
  `,
  statusStarting: css`
    background: ${cssVar.colorWarning};
  `,
  statusError: css`
    background: ${cssVar.colorError};
  `,
  body: css`
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: ${cssVar.colorBgContainer};
  `,
  terminalHost: css`
    position: absolute;
    inset: 0;
    display: none;
    padding: 8px;

    .xterm {
      height: 100%;
    }
  `,
  terminalHostActive: css`
    display: block;
  `,
  empty: css`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
}));

interface SortableTerminalTabProps {
  tab: TerminalTab;
  active: boolean;
  statusClass: (status: TerminalStatus) => string;
  onActivate: () => void;
  onClose: () => void;
}

function SortableTerminalTab({
  tab,
  active,
  statusClass,
  onActivate,
  onClose,
}: SortableTerminalTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cx(styles.tab, active && styles.tabActive)}
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={onActivate}
      {...attributes}
      {...listeners}
    >
      <span className={statusClass(tab.status)} />
      <span className={styles.tabTitle}>{tab.title}</span>
      <button
        type="button"
        className={styles.tabClose}
        title="关闭终端"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * 拖拽浮层。portal 到 document.body 后脱离了 antd-style 主题容器作用域，
 * cssVar(var(--ant-*)) 会解析为空导致透明，因此这里用 useTheme() 解析后的实际颜色值内联。
 */
function TerminalTabOverlay({ tab, theme }: { tab: TerminalTab; theme: AppTheme }) {
  return (
    <div
      className={cx(styles.tab, styles.tabActive)}
      style={{
        background: theme.colorBgElevated,
        borderColor: 'transparent',
        boxShadow: theme.boxShadowSecondary,
        color: theme.colorText,
        cursor: 'grabbing',
        opacity: 1,
      }}
    >
      <span
        className={styles.statusDot}
        style={{ background: statusDotColor(theme, tab.status) }}
      />
      <span className={styles.tabTitle}>{tab.title}</span>
      <span className={styles.tabClose} style={{ color: theme.colorTextTertiary }}>
        <X size={12} />
      </span>
    </div>
  );
}

export function TerminalPanel() {
  const { workspace, workspaceReady } = useAgentStoreContext();
  const theme = useTheme();
  const initialTabRef = useRef<TerminalTab | null>(null);
  if (initialTabRef.current === null) initialTabRef.current = createTabModel(1);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [initialTabRef.current!]);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    () => initialTabRef.current!.id,
  );
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRefs = useRef(new Map<string, HTMLDivElement>());
  const terminalRefs = useRef(new Map<string, XTerm>());
  const fitRefs = useRef(new Map<string, FitAddon>());
  const dataDisposables = useRef(new Map<string, Disposable>());
  const shellByTabRef = useRef(new Map<string, string>());
  const tabByShellRef = useRef(new Map<string, string>());
  const pendingOutputRef = useRef(new Map<string, string[]>());
  const tabsRef = useRef<TerminalTab[]>([]);
  const tabCounterRef = useRef(1);
  const workspaceRef = useRef(workspace);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const xtermTheme = useMemo(
    () => ({
      background: theme.colorBgContainer,
      cursor: theme.colorPrimary,
      foreground: theme.colorText,
      selectionBackground: theme.colorFillSecondary,
    }),
    [theme.colorBgContainer, theme.colorFillSecondary, theme.colorPrimary, theme.colorText],
  );

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const writeToTab = useCallback((tabId: string, data: string) => {
    const normalized = data.replace(/\r?\n/g, '\r\n');
    const term = terminalRefs.current.get(tabId);
    if (term) {
      term.write(normalized);
      return;
    }
    const pending = pendingOutputRef.current.get(tabId) ?? [];
    pending.push(normalized);
    pendingOutputRef.current.set(tabId, pending);
  }, []);

  const disposeTab = useCallback((tabId: string, stopShell = true) => {
    const shellId = shellByTabRef.current.get(tabId);
    if (shellId) {
      if (stopShell) void terminal.shellStop(shellId);
      shellByTabRef.current.delete(tabId);
      tabByShellRef.current.delete(shellId);
    }
    dataDisposables.current.get(tabId)?.dispose();
    dataDisposables.current.delete(tabId);
    terminalRefs.current.get(tabId)?.dispose();
    terminalRefs.current.delete(tabId);
    fitRefs.current.delete(tabId);
    pendingOutputRef.current.delete(tabId);
  }, []);

  const cleanupAll = useCallback(() => {
    for (const tab of tabsRef.current) disposeTab(tab.id);
  }, [disposeTab]);

  const createTab = useCallback((): TerminalTab => {
    const index = ++tabCounterRef.current;
    return createTabModel(index);
  }, []);

  const addTab = useCallback(() => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [createTab]);

  const closeTab = useCallback(
    (tabId: string) => {
      disposeTab(tabId);
      setTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === tabId);
        const next = prev.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          setActiveTabId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId, disposeTab],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingTabId(null);
    if (!over || active.id === over.id) return;
    setTabs((prev) => {
      const oldIndex = prev.findIndex((tab) => tab.id === active.id);
      const newIndex = prev.findIndex((tab) => tab.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setActiveTabId(String(active.id));
  }, []);

  const setHostRef = useCallback(
    (tabId: string) => (node: HTMLDivElement | null) => {
      if (node) hostRefs.current.set(tabId, node);
      else hostRefs.current.delete(tabId);
    },
    [],
  );

  const createTerminalForTab = useCallback(
    (tab: TerminalTab) => {
      if (terminalRefs.current.has(tab.id)) return;
      const host = hostRefs.current.get(tab.id);
      if (!host) return;

      const term = new XTerm({
        allowTransparency: false,
        convertEol: true,
        cursorBlink: true,
        cursorInactiveStyle: 'outline',
        cursorStyle: 'block',
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace',
        fontSize: 13,
        theme: xtermTheme,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();

      const disposable = term.onData((data) => {
        const shellId = shellByTabRef.current.get(tab.id);
        if (!shellId) return;
        void terminal.shellWrite(shellId, data).catch((err) => {
          writeToTab(tab.id, `\r\n[write error] ${String(err)}\r\n`);
        });
      });

      terminalRefs.current.set(tab.id, term);
      fitRefs.current.set(tab.id, fit);
      dataDisposables.current.set(tab.id, disposable);

      const pending = pendingOutputRef.current.get(tab.id);
      if (pending?.length) {
        pending.forEach((chunk) => term.write(chunk));
        pendingOutputRef.current.delete(tab.id);
      }
    },
    [workspaceReady, writeToTab, xtermTheme],
  );

  const startTab = useCallback(
    async (tabId: string) => {
      if (!workspaceReady) return;
      const tab = tabsRef.current.find((item) => item.id === tabId);
      if (!tab || tab.status === 'starting' || tab.status === 'running') return;

      setTabs((prev) =>
        prev.map((item) => (item.id === tabId ? { ...item, status: 'starting' } : item)),
      );
      try {
        const startWorkspace = workspace;
        const { session_id } = await terminal.shellStart(workspace);
        const stillExists = tabsRef.current.some((item) => item.id === tabId);
        if (!stillExists || workspaceRef.current !== startWorkspace) {
          void terminal.shellStop(session_id);
          return;
        }
        shellByTabRef.current.set(tabId, session_id);
        tabByShellRef.current.set(session_id, tabId);
        setTabs((prev) =>
          prev.map((item) =>
            item.id === tabId ? { ...item, shellId: session_id, status: 'running' } : item,
          ),
        );
      } catch (err) {
        writeToTab(tabId, `\r\n[shell error] ${String(err)}\r\n`);
        setTabs((prev) =>
          prev.map((item) => (item.id === tabId ? { ...item, status: 'error' } : item)),
        );
      }
    },
    [workspace, workspaceReady, writeToTab],
  );

  useEffect(() => {
    tabs.forEach(createTerminalForTab);
  }, [createTerminalForTab, tabs]);

  useEffect(() => {
    if (!workspaceReady) return;
    tabs.forEach((tab) => {
      if (tab.status === 'idle') void startTab(tab.id);
    });
  }, [startTab, tabs, workspaceReady]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void terminal.onShellOutput((event) => {
      const sessionId = event.session_id;
      if (!sessionId) return;
      const tabId = tabByShellRef.current.get(sessionId);
      if (!tabId) return;

      if (event.type === 'output' && event.data) writeToTab(tabId, event.data);
      if (event.type === 'exit') {
        writeToTab(tabId, `\r\n[shell exited ${event.exit_code ?? 0}]\r\n`);
        shellByTabRef.current.delete(tabId);
        tabByShellRef.current.delete(sessionId);
        setTabs((prev) =>
          prev.map((tab) => (tab.id === tabId ? { ...tab, status: 'exited' } : tab)),
        );
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [writeToTab]);

  useEffect(() => {
    for (const term of terminalRefs.current.values()) {
      term.options.theme = xtermTheme;
      term.refresh(0, term.rows - 1);
    }
  }, [xtermTheme]);

  useEffect(() => {
    if (!activeTabId) return;
    requestAnimationFrame(() => {
      fitRefs.current.get(activeTabId)?.fit();
      terminalRefs.current.get(activeTabId)?.focus();
    });
  }, [activeTabId]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => {
      if (activeTabId) fitRefs.current.get(activeTabId)?.fit();
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [activeTabId]);

  useEffect(() => {
    if (workspaceRef.current === workspace) return;
    const hadTabs = tabsRef.current.length > 0;
    cleanupAll();
    workspaceRef.current = workspace;
    tabCounterRef.current = 1;
    if (hadTabs) {
      const tab = createTabModel(1);
      setTabs([tab]);
      setActiveTabId(tab.id);
    } else {
      setTabs([]);
      setActiveTabId(null);
    }
  }, [cleanupAll, workspace]);

  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  const statusClass = (status: TerminalStatus) =>
    cx(
      styles.statusDot,
      status === 'running' && styles.statusRunning,
      status === 'starting' && styles.statusStarting,
      (status === 'error' || status === 'exited') && styles.statusError,
    );
  const draggingTab = draggingTabId ? tabs.find((tab) => tab.id === draggingTabId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToWindowBelowTitlebar]}
      onDragStart={(event) => setDraggingTabId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingTabId(null)}
    >
      <Flexbox className={styles.container}>
        <div className={styles.header}>
          <div className={styles.tabs}>
            <SortableContext
              items={tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {tabs.map((tab) => (
                <SortableTerminalTab
                  key={tab.id}
                  tab={tab}
                  active={activeTabId === tab.id}
                  statusClass={statusClass}
                  onActivate={() => setActiveTabId(tab.id)}
                  onClose={() => closeTab(tab.id)}
                />
              ))}
            </SortableContext>
          </div>
          <ActionIcon icon={Plus} size="small" title="新建终端" onClick={addTab} />
        </div>
        <div ref={panelRef} className={styles.body}>
          {tabs.length === 0 && <div className={styles.empty}>没有打开的终端。点击右上角 + 新建。</div>}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              ref={setHostRef(tab.id)}
              className={cx(styles.terminalHost, activeTabId === tab.id && styles.terminalHostActive)}
            />
          ))}
        </div>
      </Flexbox>
      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay adjustScale={false} dropAnimation={null} zIndex={9999}>
              {draggingTab ? <TerminalTabOverlay tab={draggingTab} theme={theme} /> : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
