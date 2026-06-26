import type { AgentEvent, AgentMessage, AssistantMessageEvent } from '../lib/pi';

/** 用户消息里的图片（base64），用于在气泡中回显发送的图片。 */
export interface UserImage {
  mimeType: string;
  data: string;
}

export type ChatMessage =
  | { kind: 'user'; id: string; text: string; images?: UserImage[]; steering?: boolean }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      thinking: string;
      streaming: boolean;
      /** pi 消息自带的 Unix ms 时间戳，用作推理时长持久化的 key。 */
      timestamp?: number;
      /** 推理开始时间戳（首个 thinking 出现时记起点），用于计算时长。 */
      thinkingStartedAt?: number;
      /** 推理耗时（ms），推理结束（正文开始或消息结束）时定格，用于「已深度思考（用时 X 秒）」。 */
      thinkingDuration?: number;
    }
  | { kind: 'tool'; id: string; toolCallId: string; toolName: string; args: unknown; result: unknown; status: 'running' | 'done' | 'error' }
  | { kind: 'notice'; id: string; customType: string; content: string };

export interface AgentState {
  messages: ChatMessage[];
  isStreaming: boolean;
  steering: string[];
  followUp: string[];
  lastError?: string;
  /** 发送失败自动重试中的进度（attempt 从 1 起，max 为总重试次数）；非重试时为 undefined。 */
  retrying?: { attempt: number; max: number };
  /** 用户主动中断进行中：abort 触发的 "request aborted" 类报错不该弹红条，置位期间 reducer 丢弃这些
   * 错误（仅抑制用户主动中断，不影响真实失败）。由 ChatView 点停止时置位，agent_start/agent_end 清位。 */
  aborting?: boolean;
  /** 发送后到后端首个 agent_start 之间的「准备响应中」占位态：发送即置位，agent_start/agent_end/出错清位。
   * 用于在 isStreaming 尚未为 true 的冷启动/会话预备窗口立即给出等待反馈（消除「不知道在等什么」的空档）。 */
  awaitingResponse?: boolean;
}

export function initialAgentState(): AgentState {
  return { messages: [], isStreaming: false, steering: [], followUp: [] };
}

let counter = 0;
const nextId = () => `m${++counter}`;

/** 计算推理计时：首个 thinking 出现时记起点，正文出现或消息结束（final）时定格耗时。 */
function thinkingTiming(
  cur: { thinkingStartedAt?: number; thinkingDuration?: number },
  thinkingText: string,
  answerText: string,
  final = false,
): { thinkingStartedAt?: number; thinkingDuration?: number } {
  let { thinkingStartedAt, thinkingDuration } = cur;
  if (thinkingText.trim() && thinkingStartedAt == null) thinkingStartedAt = Date.now();
  const reasoningEnded = final || answerText.trim().length > 0;
  if (reasoningEnded && thinkingStartedAt != null && thinkingDuration == null) {
    thinkingDuration = Date.now() - thinkingStartedAt;
  }
  return { thinkingStartedAt, thinkingDuration };
}

/** 读取 pi 消息的 Unix ms 时间戳（非法值返回 undefined）。 */
function messageTimestamp(msg: AgentMessage): number | undefined {
  const ts = (msg as { timestamp?: unknown }).timestamp;
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : undefined;
}

/** 读取 pi assistant 消息上的 errorMessage（模型/供应商失败时 Pi 会带上，此前被 UI 丢弃）。 */
function messageError(msg: AgentMessage): string | undefined {
  const raw = (msg as { errorMessage?: unknown }).errorMessage;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function extractText(msg: AgentMessage): { text: string; thinking: string } {
  let text = '';
  let thinking = '';
  const content = msg.content;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content as Array<Record<string, unknown> | null>) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && typeof block.text === 'string') text += block.text;
      if (block.type === 'thinking' && typeof block.thinking === 'string') thinking += block.thinking;
    }
  }
  return { text, thinking };
}

/** 提取用户消息里的图片块（与发送格式一致：{type:'image', mimeType, data}）。Pi 用别的格式则不提取。 */
function extractImages(msg: AgentMessage): UserImage[] {
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  const out: UserImage[] = [];
  for (const block of content as Array<Record<string, unknown> | null>) {
    if (!block || typeof block !== 'object') continue;
    if (
      block.type === 'image' &&
      typeof block.mimeType === 'string' &&
      typeof block.data === 'string'
    ) {
      out.push({ mimeType: block.mimeType, data: block.data });
    }
  }
  return out;
}

interface PendingToolCall {
  toolName: string;
  args: unknown;
}

/** 从 assistant 消息的 content 块提取 toolCall（供历史还原时匹配 args）。 */
function extractToolCalls(msg: AgentMessage): Array<{ id: string; toolName: string; args: unknown }> {
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; toolName: string; args: unknown }> = [];
  for (const block of content as Array<Record<string, unknown> | null>) {
    if (!block || block.type !== 'toolCall') continue;
    const id = typeof block.id === 'string' ? block.id : '';
    const toolName = typeof block.name === 'string' ? block.name : '';
    if (!id || !toolName) continue;
    out.push({
      id,
      toolName,
      args: block.arguments ?? block.input ?? {},
    });
  }
  return out;
}

function registerToolCalls(pending: Map<string, PendingToolCall>, msg: AgentMessage): void {
  for (const tc of extractToolCalls(msg)) {
    pending.set(tc.id, { toolName: tc.toolName, args: tc.args });
  }
}

/** 把 pi toolResult 消息还原成与 tool_execution_end 一致的 result 形状。 */
function toolResultPayload(msg: AgentMessage): unknown {
  const raw = msg as { content?: unknown; details?: unknown };
  if (raw.content == null && raw.details === undefined) return {};
  return {
    ...(raw.content != null ? { content: raw.content } : {}),
    ...(raw.details !== undefined ? { details: raw.details } : {}),
  };
}

/** 把 pi 的 CustomMessage（role:'custom', display:true）转成一条去重的 notice。 */
function applyCustomMessage(state: AgentState, msg: AgentMessage): AgentState {
  if ((msg as { display?: unknown }).display !== true) return state;
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!content.trim()) return state;
  if (state.messages.some((m) => m.kind === 'notice' && m.content === content)) return state;
  const rawCustomType = (msg as { customType?: unknown }).customType;
  const customType = typeof rawCustomType === 'string' ? rawCustomType : '';
  return {
    ...state,
    messages: [...state.messages, { kind: 'notice', id: nextId(), customType, content }],
  };
}

export function applyEvent(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case 'agent_start':
      // 一轮真正开始流式：清掉「正在重试」指示（成功重连/重发）、上一条错误与中断标记，
      // 并清掉「准备响应中」占位（由 isStreaming 接管等待指示，无缝过渡）。
      return { ...state, isStreaming: true, awaitingResponse: false, lastError: undefined, retrying: undefined, aborting: false };

    case 'agent_end':
      return {
        ...state,
        isStreaming: false,
        awaitingResponse: false,
        aborting: false,
        messages: state.messages.map((m) =>
          m.kind === 'assistant' ? { ...m, streaming: false } : m,
        ),
      };

    case 'message_start': {
      const ev = event as Extract<AgentEvent, { type: 'message_start' }>;
      if (ev.message.role === 'custom') return applyCustomMessage(state, ev.message);
      if (ev.message.role !== 'assistant') return state;
      const { text, thinking } = extractText(ev.message);
      const messages = [...state.messages];
      const idx = lastIndex(messages, (m) => m.kind === 'assistant' && m.streaming);
      // pi 同一时刻只有一个 streamingMessage；重复 message_start 应复用而非叠空泡
      if (idx >= 0) {
        const cur = messages[idx] as Extract<ChatMessage, { kind: 'assistant' }>;
        const nextText = text || cur.text;
        const nextThinking = thinking || cur.thinking;
        messages[idx] = {
          ...cur,
          text: nextText,
          thinking: nextThinking,
          timestamp: messageTimestamp(ev.message) ?? cur.timestamp,
          ...thinkingTiming(cur, nextThinking, nextText),
        };
        return { ...state, messages };
      }
      return {
        ...state,
        messages: [
          ...messages,
          {
            kind: 'assistant',
            id: nextId(),
            text,
            thinking,
            streaming: true,
            timestamp: messageTimestamp(ev.message),
            ...thinkingTiming({}, thinking, text),
          },
        ],
      };
    }

    case 'message_end': {
      const ev = event as Extract<AgentEvent, { type: 'message_end' }>;
      if (ev.message.role === 'custom') return applyCustomMessage(state, ev.message);
      if (ev.message.role !== 'assistant') return state;
      const { text, thinking } = extractText(ev.message);
      const errMsg = messageError(ev.message);
      const messages = [...state.messages];
      const idx = lastIndex(messages, (m) => m.kind === 'assistant' && m.streaming);
      // 用户主动中断期间，abort 触发的 errorMessage 不弹红条（aborting 由 ChatView 置位）。
      const showErr = errMsg && !state.aborting ? errMsg : undefined;
      if (idx < 0) {
        if (!text && !thinking) {
          return showErr ? { ...state, lastError: showErr } : state;
        }
        return {
          ...state,
          ...(showErr ? { lastError: showErr } : {}),
          messages: [
            ...messages,
            {
              kind: 'assistant',
              id: nextId(),
              text,
              thinking,
              streaming: false,
              timestamp: messageTimestamp(ev.message),
              ...thinkingTiming({}, thinking, text, true),
            },
          ],
        };
      }
      const cur = messages[idx] as Extract<ChatMessage, { kind: 'assistant' }>;
      // 终态消息可能不含 thinking 块（推理只在流式 delta 里给），保留流式累积的 thinking，避免完成后丢失。
      const finalThinking = thinking || cur.thinking;
      // 仅含 tool call、无可见文本/思考的 assistant 消息不展示（否则会叠成多条灰线）
      if (!text && !finalThinking) {
        messages.splice(idx, 1);
      } else {
        messages[idx] = {
          ...cur,
          text,
          thinking: finalThinking,
          streaming: false,
          timestamp: messageTimestamp(ev.message) ?? cur.timestamp,
          ...thinkingTiming(cur, finalThinking, text, true),
        };
      }
      return showErr ? { ...state, messages, lastError: showErr } : { ...state, messages };
    }

    case 'message_update': {
      const ev = event as Extract<AgentEvent, { type: 'message_update' }>;
      const { text, thinking } = extractText(ev.message);
      // 有些模型（如部分 OpenAI 兼容 / MiMo）只在流式 thinking_delta 里给推理、不写进 message.content，
      // 这里把 delta 累积起来，作为 content 无 thinking 块时的兜底来源。
      const ame = ev.assistantMessageEvent as AssistantMessageEvent | undefined;
      const thinkingDelta =
        ame && ame.type === 'thinking_delta' && typeof ame.delta === 'string' ? ame.delta : '';
      const messages = [...state.messages];
      const idx = lastIndex(messages, (m) => m.kind === 'assistant' && m.streaming);
      if (idx >= 0) {
        const cur = messages[idx] as Extract<ChatMessage, { kind: 'assistant' }>;
        const nextThinking = thinking || cur.thinking + thinkingDelta;
        messages[idx] = {
          ...cur,
          text,
          thinking: nextThinking,
          timestamp: messageTimestamp(ev.message) ?? cur.timestamp,
          ...thinkingTiming(cur, nextThinking, text),
        };
      } else {
        const nextThinking = thinking || thinkingDelta;
        messages.push({
          kind: 'assistant',
          id: nextId(),
          text,
          thinking: nextThinking,
          streaming: true,
          timestamp: messageTimestamp(ev.message),
          ...thinkingTiming({}, nextThinking, text),
        });
      }
      return { ...state, messages };
    }

    case 'tool_execution_start': {
      const ev = event as Extract<AgentEvent, { type: 'tool_execution_start' }>;
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            kind: 'tool',
            id: nextId(),
            toolCallId: ev.toolCallId,
            toolName: ev.toolName,
            args: ev.args,
            result: undefined,
            status: 'running',
          },
        ],
      };
    }

    case 'tool_execution_update': {
      const ev = event as Extract<AgentEvent, { type: 'tool_execution_update' }>;
      return updateTool(state, ev.toolCallId, (t) => ({ ...t, result: ev.partialResult }));
    }

    case 'tool_execution_end': {
      const ev = event as Extract<AgentEvent, { type: 'tool_execution_end' }>;
      return updateTool(state, ev.toolCallId, (t) => ({
        ...t,
        result: ev.result,
        status: ev.isError ? 'error' : 'done',
      }));
    }

    case 'queue_update': {
      const ev = event as Extract<AgentEvent, { type: 'queue_update' }>;
      return { ...state, steering: ev.steering ?? [], followUp: ev.followUp ?? [] };
    }

    case 'auto_retry_end': {
      const ev = event as Extract<AgentEvent, { type: 'auto_retry_end' }>;
      return ev.success ? { ...state, lastError: undefined } : { ...state, lastError: ev.finalError };
    }

    case 'extension_error': {
      const ev = event as Extract<AgentEvent, { type: 'extension_error' }>;
      return { ...state, lastError: ev.error };
    }

    default: {
      // 兜底：捕获未显式建模、但带 string error 字段的错误事件，避免失败被静默吞掉。
      // 注意：不在此处设 isStreaming:false——流尚未结束（agent_end 还没到），提前停流会让
      // awaitStreamingEnd 提前 resolve，导致 runOnce 误判失败并闪现错误 banner。
      const maybeError = (event as { error?: unknown }).error;
      if (typeof maybeError === 'string' && maybeError.trim()) {
        if (state.aborting) return { ...state, isStreaming: false };
        return { ...state, lastError: maybeError };
      }
      return state;
    }
  }
}

/**
 * 本地插入一条用户消息（pi 不会回发用户消息，需前端在发送时主动加入）。
 * steering=true 表示这是执行中注入当前回合的引导消息——不视为「新一轮等待响应」，
 * 避免触发「准备响应中」占位（AI 此刻已在响应）。
 */
export function addUserMessage(
  state: AgentState,
  text: string,
  images?: UserImage[],
  steering?: boolean,
): AgentState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        kind: 'user',
        id: nextId(),
        text,
        images: images?.length ? images : undefined,
        ...(steering ? { steering: true } : {}),
      },
    ],
  };
}

/**
 * 从 pi get_messages 结果还原聊天列表（用于切换会话）。
 * pi 会话不存推理耗时，可传 getDuration 按消息 timestamp 回填（见 lib/thinkingDurations）。
 */
export function messagesFromAgent(
  msgs: AgentMessage[],
  getDuration?: (timestamp: number | undefined) => number | undefined,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  const pendingToolCalls = new Map<string, PendingToolCall>();

  for (const msg of msgs) {
    if (msg.role === 'custom') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      if ((msg as { display?: unknown }).display === true && content.trim()) {
        const rawCustomType = (msg as { customType?: unknown }).customType;
        const customType = typeof rawCustomType === 'string' ? rawCustomType : '';
        out.push({ kind: 'notice', id: nextId(), customType, content });
      }
      continue;
    }
    if (msg.role === 'user') {
      const { text } = extractText(msg);
      const images = extractImages(msg);
      if (text.trim() || images.length)
        out.push({ kind: 'user', id: nextId(), text, images: images.length ? images : undefined });
      continue;
    }
    if (msg.role === 'assistant') {
      registerToolCalls(pendingToolCalls, msg);
      const { text, thinking } = extractText(msg);
      if (text.trim() || thinking.trim()) {
        const timestamp = messageTimestamp(msg);
        out.push({
          kind: 'assistant',
          id: nextId(),
          text,
          thinking,
          streaming: false,
          timestamp,
          thinkingDuration: thinking.trim() ? getDuration?.(timestamp) : undefined,
        });
      }
      continue;
    }
    if (msg.role === 'toolResult') {
      const raw = msg as { toolCallId?: unknown; toolName?: unknown; isError?: unknown };
      const toolCallId = typeof raw.toolCallId === 'string' ? raw.toolCallId : nextId();
      const pending = pendingToolCalls.get(toolCallId);
      const toolName =
        typeof raw.toolName === 'string' ? raw.toolName : pending?.toolName ?? 'unknown';
      out.push({
        kind: 'tool',
        id: nextId(),
        toolCallId,
        toolName,
        args: pending?.args ?? {},
        result: toolResultPayload(msg),
        status: raw.isError === true ? 'error' : 'done',
      });
      pendingToolCalls.delete(toolCallId);
    }
  }
  return out;
}

/**
 * 把子代理 `--mode json` 的 JSONL 输出（每行一个 AgentEvent，首行可能是 session header）
 * 还原成聊天消息列表 —— 复用主对话同一套 reducer，因此子代理对话能用相同气泡组件渲染。
 * id 重写为基于下标的稳定值，避免每次重解析改变 id 导致 React 重挂载。
 */
export function messagesFromTranscript(transcript: string): ChatMessage[] {
  let state = initialAgentState();
  for (const line of transcript.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: AgentEvent;
    try {
      event = JSON.parse(trimmed) as AgentEvent;
    } catch {
      continue;
    }
    if (typeof (event as { type?: unknown }).type !== 'string') continue;
    state = applyEvent(state, event);
  }
  return state.messages.map((m, i) => ({ ...m, id: `sa-${i}` }));
}

function lastIndex(arr: ChatMessage[], pred: (m: ChatMessage) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

function updateTool(
  state: AgentState,
  toolCallId: string,
  fn: (t: Extract<ChatMessage, { kind: 'tool' }>) => Extract<ChatMessage, { kind: 'tool' }>,
): AgentState {
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.kind === 'tool' && m.toolCallId === toolCallId ? fn(m) : m,
    ),
  };
}
