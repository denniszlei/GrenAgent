import { create } from 'zustand';
import {
  applyEvent,
  initialAgentState,
  addUserMessage,
  messagesFromAgent,
  type AgentState,
  type UserImage,
} from './agentReducer';
import { onPiEvent, onPiExit, type AgentEvent, type AgentMessage } from '../lib/pi';
import { getThinkingDuration, saveThinkingDuration } from '../lib/thinkingDurations';
import { getCachedSession, setCachedSession, sessionSignature } from '../lib/sessionMessageCache';

export interface LoadMessagesOptions {
  force?: boolean;
  /** 本次载入对应的会话路径：记录后供切回时判断「内存内容是否已是目标会话」从而跳过重载。 */
  sessionPath?: string | null;
}

export interface AgentStoreApi {
  useStore: {
    (): AgentState;
    <T>(selector: (s: AgentState) => T): T;
    getState: () => AgentState;
    setState: (partial: Partial<AgentState> | ((s: AgentState) => Partial<AgentState>)) => void;
    subscribe: (listener: (s: AgentState, prev: AgentState) => void) => () => void;
  };
  setActive: (active: boolean) => void;
  pushUserMessage: (text: string, images?: UserImage[], steering?: boolean) => void;
  loadMessages: (msgs: AgentMessage[], options?: LoadMessagesOptions) => void;
  reset: () => void;
  hasLiveActivity: () => boolean;
  /**
   * 当前内存内容对应的会话路径：
   * - `undefined`：从未载入过（需完整加载）
   * - `string | null`：已载入过该会话（切回时若与目标一致即可复用缓存、跳过重载）
   */
  getLoadedSessionPath: () => string | null | undefined;
  /**
   * 尝试用模块级缓存秒显某会话（命中且非实时流式时）。
   * 命中返回 true（已把缓存内容写入展示态，可跳过骨架屏）；未命中返回 false（调用方需走完整后端加载）。
   */
  showCachedSession: (sessionPath: string) => boolean;
  destroy: () => void;
}

/** 非 active store 的 flush 间隔（rAF 在后台被节流，用 setTimeout 兜底）。 */
const BACKGROUND_FLUSH_MS = 60;

/** 为某工作区创建 agent 状态，并订阅 pi://event。 */
export function createAgentStore(workspace: string): AgentStoreApi {
  let liveActivity = false;
  // 内存内消息当前对应的会话路径（undefined = 从未载入）。用于切回工作区时判断是否可复用缓存。
  let loadedSessionPath: string | null | undefined = undefined;
  // 当前展示内容的轻量签名：后台刷新比对，未变则跳过 setState，避免整列重渲染闪一下。
  let currentSig = '';
  const unsubs: Array<() => void> = [];

  const useStore = create<AgentState>(() => initialAgentState());

  const setFullState = (next: AgentState) => {
    useStore.setState(next, true);
  };

  // —— 事件按动画帧批量应用（对齐 lobehub 流式平滑的思路）——
  // 高频 thinking/text delta 一帧内合并为一次 setState，降低渲染压力；
  // 打字机视觉由 Markdown animated 承担，不丢任何事件、保持顺序。
  let queue: AgentEvent[] = [];
  let rafId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let active = true;

  /** 推理结束后把实时计出的时长按消息 timestamp 落盘（供切换会话后回填）。 */
  const persistThinkingDurations = (state: AgentState) => {
    for (const m of state.messages) {
      if (
        m.kind === 'assistant' &&
        m.thinking &&
        m.timestamp != null &&
        m.thinkingDuration != null
      ) {
        saveThinkingDuration(m.timestamp, m.thinkingDuration);
      }
    }
  };

  const flush = () => {
    rafId = null;
    timeoutId = null;
    if (!queue.length) return;
    const events = queue;
    queue = [];
    let state = useStore.getState();
    let reachedEnd = false;
    for (const ev of events) {
      state = applyEvent(state, ev);
      if (ev.type === 'message_end' || ev.type === 'agent_end') reachedEnd = true;
    }
    setFullState(state);
    if (reachedEnd) {
      persistThinkingDurations(state);
      // 一轮结束后把当前会话最新内容写回缓存，使切走再切回时缓存即最新（不会先显旧快照再刷新闪动）。
      if (loadedSessionPath != null) {
        currentSig = sessionSignature(state.messages);
        setCachedSession(loadedSessionPath, state.messages, currentSig);
      }
    }
  };

  const scheduleFlush = () => {
    if (rafId != null || timeoutId != null) return;
    if (active && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(flush);
    } else {
      timeoutId = setTimeout(flush, BACKGROUND_FLUSH_MS);
    }
  };

  /** 丢弃未应用的排队事件（切换/重置会话时调用，避免旧会话事件串场）。 */
  const clearQueue = () => {
    queue = [];
    if (rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
    rafId = null;
    timeoutId = null;
  };

  onPiEvent((env) => {
    if (env.workspace !== workspace) return;
    queue.push(env.event);
    scheduleFlush();
  }).then((un) => unsubs.push(un));

  onPiExit((env) => {
    if (env.workspace !== workspace) return;
    useStore.setState({ isStreaming: false });
  }).then((un) => unsubs.push(un));

  const pushUserMessage = (text: string, images?: UserImage[], steering?: boolean) => {
    liveActivity = true;
    setFullState(addUserMessage(useStore.getState(), text, images, steering));
  };

  const loadMessages = (msgs: AgentMessage[], options?: LoadMessagesOptions) => {
    if (liveActivity && !options?.force) return;
    const sessionPath =
      options && 'sessionPath' in options ? options.sessionPath ?? null : undefined;
    const processed = messagesFromAgent(msgs, getThinkingDuration);
    const sig = sessionSignature(processed);
    // 后台刷新命中「同一会话 + 内容未变」→ 跳过 setState：缓存已秒显，无谓重渲染会让整列闪一下。
    if (sessionPath != null && sessionPath === loadedSessionPath && sig === currentSig) {
      liveActivity = false;
      return;
    }
    liveActivity = false;
    if (sessionPath !== undefined) loadedSessionPath = sessionPath;
    currentSig = sig;
    if (sessionPath != null) setCachedSession(sessionPath, processed, sig);
    clearQueue();
    setFullState({ ...initialAgentState(), messages: processed });
  };

  const reset = () => {
    liveActivity = false;
    // 新会话尚无落盘路径：标记为未载入，切回时按完整加载处理（届时会话已有路径）。
    loadedSessionPath = undefined;
    currentSig = '';
    clearQueue();
    setFullState(initialAgentState());
  };

  return {
    useStore,
    setActive: (next) => {
      active = next;
    },
    pushUserMessage,
    loadMessages,
    reset,
    hasLiveActivity: () => liveActivity,
    getLoadedSessionPath: () => loadedSessionPath,
    showCachedSession: (sessionPath) => {
      // 实时流式中不可被缓存覆盖（会冲掉正在跑的会话）。
      if (liveActivity) return false;
      const entry = getCachedSession(sessionPath);
      if (!entry) return false;
      loadedSessionPath = sessionPath;
      currentSig = entry.sig;
      clearQueue();
      setFullState({ ...initialAgentState(), messages: entry.messages });
      return true;
    },
    destroy: () => {
      clearQueue();
      for (const un of unsubs) un();
      unsubs.length = 0;
    },
  };
}
