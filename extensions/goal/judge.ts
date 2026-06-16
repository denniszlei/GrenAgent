import { type AskFn, parseJsonLoose } from "./llm.js";

export interface Verdict {
  ok: boolean;
  reason: string;
}

/** Flatten heterogeneous AgentMessage[] to "role: text" lines. */
function messageToText(m: unknown): string {
  const obj = (m ?? {}) as { role?: string; content?: unknown };
  const role = obj.role ?? "";
  const content = obj.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
      .map((p) => p.text)
      .join(" ");
  }
  return text ? `${role}: ${text}` : "";
}

/** Join messages to a transcript, keeping the most recent `maxChars` characters. */
export function flattenTranscript(messages: unknown[], maxChars = 12000): string {
  return messages.map(messageToText).filter(Boolean).join("\n").slice(-maxChars);
}

const JUDGE_SYSTEM =
  "You are an independent judge. Decide whether the assistant has ACTUALLY satisfied the user's stated " +
  "completion condition, based strictly on the transcript. Be skeptical of optimistic self-claims; require evidence. " +
  'Output STRICT JSON only (no prose): {"verdict":"ok"|"not_ok","reason":string}. ok = condition fully met; not_ok = not yet.';

export function buildJudgeUser(condition: string, transcript: string): string {
  return `Completion condition:\n${condition}\n\nTranscript (most recent last):\n${transcript}`;
}

export function parseVerdict(raw: string): Verdict {
  const parsed = parseJsonLoose<{ verdict?: string; reason?: string }>(raw);
  if (parsed?.verdict === "not_ok") return { ok: false, reason: parsed.reason ?? "条件未满足" };
  if (parsed?.verdict === "ok") return { ok: true, reason: parsed.reason ?? "条件已满足" };
  // Text fallback: only a clear "not ok" keeps the agent going.
  if (/\bnot[_\s-]?ok\b/i.test(raw)) return { ok: false, reason: raw.trim().slice(0, 200) || "条件未满足" };
  // Unparseable → fail-open (release; never trap the user).
  return { ok: true, reason: "裁判输出无法解析，放行" };
}

/** Run the judge. Never throws: any failure is fail-open (ok=true → release). */
export async function judge(ask: AskFn, messages: unknown[], condition: string, maxChars = 12000): Promise<Verdict> {
  try {
    const transcript = flattenTranscript(messages, maxChars);
    const raw = await ask(JUDGE_SYSTEM, buildJudgeUser(condition, transcript));
    return parseVerdict(raw);
  } catch {
    return { ok: true, reason: "裁判调用失败，放行" };
  }
}
