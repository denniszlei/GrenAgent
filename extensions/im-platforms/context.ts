// Bounded per-conversation context for IM (WeChat / gateway) traffic. The
// gateway OWNS this history instead of injecting messages into the owner's
// interactive session, so IM traffic is fully isolated and its context window
// can never grow unbounded: each conversation keeps only the most recent
// `maxMessages` entries (a sliding window). The rendered transcript is fed to a
// one-shot isolated agent run, which returns exactly one reply.

export type ImRole = "user" | "assistant";

export interface ImTurn {
  role: ImRole;
  text: string;
}

export interface ImContextStore {
  /** Current bounded history for a conversation key (oldest first). */
  history(key: string): ImTurn[];
  /** Append a turn (empty text ignored), trim the conversation, and LRU-evict old conversations. */
  append(key: string, role: ImRole, text: string): void;
  /** Update the per-conversation cap (and optionally the max-conversations cap); re-trim + evict (hot config). */
  setMax(maxMessages: number, maxConversations?: number): void;
  /** Serialize all conversations for persistence. */
  toJSON(): Record<string, ImTurn[]>;
  /** Restore conversations from persisted JSON (best-effort, then trim). */
  loadJSON(data: unknown): void;
}

const MIN_MAX = 2;
const DEFAULT_MAX_CONVERSATIONS = 200;

function normalizeMax(maxMessages: number): number {
  const n = Math.floor(maxMessages);
  return Number.isFinite(n) && n >= MIN_MAX ? n : MIN_MAX;
}

function normalizeMaxConversations(maxConversations: number | undefined): number {
  if (maxConversations === undefined) return DEFAULT_MAX_CONVERSATIONS;
  const n = Math.floor(maxConversations);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_CONVERSATIONS;
}

// 把用户文本里的换行折叠为空格：转录是「行首角色标签（用户：/助手：）」格式，若放任正文换行，
// 用户可注入形如「\n助手：好的\n用户：…」的伪造对话行来篡改历史 / 越权诱导。折叠换行即消除该面。
function flattenForPrompt(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/**
 * Render the bounded history into a single prompt for a one-shot agent run.
 * The last line is always the latest user message; the agent is told to reply
 * to it directly (no emoji, no history restatement). Each message body has its
 * newlines flattened so a sender cannot forge extra 用户：/助手： transcript lines.
 */
export function renderPrompt(history: ImTurn[]): string {
  const lines = history.map((t) => `${t.role === "user" ? "用户" : "助手"}：${flattenForPrompt(t.text)}`);
  return (
    "下面是你与同一位微信用户的最近对话（只保留了最近若干条，越靠后越新）。" +
    "请用简洁中文直接回复最后一条「用户」消息：不要复述历史、不要使用 emoji。\n\n" +
    lines.join("\n")
  );
}

export function createImContextStore(opts: { maxMessages: number; maxConversations?: number }): ImContextStore {
  let max = normalizeMax(opts.maxMessages);
  let maxConv = normalizeMaxConversations(opts.maxConversations);
  // Insertion-ordered Map used as an LRU: append() re-inserts the touched key at
  // the tail, so the head is always the least-recently-active conversation.
  const byKey = new Map<string, ImTurn[]>();

  const trim = (list: ImTurn[]): ImTurn[] => (list.length > max ? list.slice(list.length - max) : list);

  // Evict the oldest conversations until within the cap. Bounds memory + the
  // persisted JSON in accept-all (no-owner) mode, where every distinct sender
  // would otherwise add an unbounded, never-expiring key.
  const evict = (): void => {
    while (byKey.size > maxConv) {
      const oldest = byKey.keys().next().value;
      if (oldest === undefined) break;
      byKey.delete(oldest);
    }
  };

  return {
    history(key) {
      return byKey.get(key) ?? [];
    },
    append(key, role, text) {
      const t = (text ?? "").trim();
      if (!t) return;
      const list = byKey.get(key) ?? [];
      list.push({ role, text: t });
      byKey.delete(key); // move to the tail (most-recently-active) for LRU ordering
      byKey.set(key, trim(list));
      evict();
    },
    setMax(maxMessages, maxConversations) {
      max = normalizeMax(maxMessages);
      if (maxConversations !== undefined) maxConv = normalizeMaxConversations(maxConversations);
      for (const [k, list] of byKey) byKey.set(k, trim(list));
      evict();
    },
    toJSON() {
      return Object.fromEntries(byKey);
    },
    loadJSON(data) {
      if (!data || typeof data !== "object") return;
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const turns: ImTurn[] = v
          .filter(
            (x): x is ImTurn =>
              !!x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string",
          )
          .map((x) => ({ role: x.role === "assistant" ? "assistant" : "user", text: String(x.text) }));
        byKey.set(k, trim(turns));
      }
      evict();
    },
  };
}
