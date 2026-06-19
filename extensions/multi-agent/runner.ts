// Spawn isolated pi sub-agents (separate processes) and collect their output.
// Mirrors the official subagent example: `pi --mode json -p --no-session <task>`.

import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getConfig } from "../_shared/runtime-config.js";
import { resolveMcpServers } from "./capability.js";

export interface AgentResult {
  ok: boolean;
  output: string;
  exitCode: number;
  error?: string;
  /** Raw `--mode json` JSONL stream (one AgentEvent per line) for UI replay. */
  transcript: string;
}

/** Streaming update payload: latest final text plus the full raw JSONL transcript. */
export interface AgentUpdate {
  text: string;
  transcript: string;
}

interface PiEvent {
  type?: string;
  role?: string;
  text?: string;
  content?: unknown;
  message?: { role?: string; content?: unknown };
}

const timeoutMs = () => Number(getConfig("SUBAGENT_TIMEOUT_MS") ?? "120000") || 120000;

/** User-configured sub-agent model (`SUBAGENT_MODEL` env). Empty → inherit main agent default. */
export function resolveSubagentModel(): string | undefined {
  const raw = getConfig("SUBAGENT_MODEL")?.trim();
  return raw || undefined;
}

export function resolvePiCommand(): { cmd: string; baseArgs: string[] } {
  // PI_BIN explicitly overrides; otherwise reuse the current executable (the
  // sidecar binary itself under bun --compile) so desktop needs no global `pi`.
  const piBin = getConfig("PI_BIN");
  if (piBin) return { cmd: piBin, baseArgs: [] };
  return { cmd: process.execPath, baseArgs: [] };
}

export function extractFinalText(jsonlOutput: string): string {
  const lines = jsonlOutput.split(/\r?\n/).filter((l) => l.trim());
  let text = "";
  for (const line of lines) {
    let ev: PiEvent | null = null;
    try {
      ev = JSON.parse(line) as PiEvent;
    } catch {
      continue;
    }
    const role = ev.message?.role ?? ev.role;
    if (role !== "assistant") continue;
    const content = ev.message?.content ?? ev.content ?? ev.text;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const t = content
        .filter((p): p is { type: string; text: string } => !!p && typeof p === "object" && (p as { type?: string }).type === "text")
        .map((p) => p.text)
        .join("");
      if (t) text = t;
    }
  }
  return text || jsonlOutput.slice(-4000).trim();
}

// Memory/KB switches a sub-agent forces OFF relative to the main agent: re-running
// embeddings / extraction in every one-shot child is wasteful and can recurse.
// MCP is handled separately (resolveMcpServers) because it's on-demand per profile.
const SUBAGENT_MEMORY_OFF: Record<string, string> = {
  MEMORY_EXTRACT: "0",
  MEMORY_AUTO_INJECT: "0",
  MEMORY_AUTO_CAPTURE: "0",
  KB_AUTO_INJECT: "0",
};

interface SubagentRuntimeConfig {
  /** Path to the derived config file, or undefined when there is no parent config file. */
  path: string | undefined;
  /** Env overrides to inject into the child (profile env + memory-off + MCP_SERVERS). */
  env: Record<string, string>;
  cleanup: () => void;
}

// getConfig reads PI_RUNTIME_CONFIG (a file) first and process.env only as a
// fallback, so a spawn-time env override can't turn off a key already present in
// that file (e.g. GUI-written MCP_SERVERS). To make sub-agent overrides actually
// win, we derive a child config: inherit every parent setting, then layer on the
// profile env, the memory-off switches, and the on-demand MCP_SERVERS. The same
// overrides are returned as `env` so they still apply when there is no parent
// config file. `mcp` (from profile.mcp) decides how much of the parent's MCP the
// sub-agent inherits (none / all / allowlist) — see resolveMcpServers.
export function buildSubagentRuntimeConfig(
  mcp: boolean | string[] | undefined,
  extraEnv: Record<string, string> = {},
): SubagentRuntimeConfig {
  const src = process.env.PI_RUNTIME_CONFIG;
  let base: Record<string, unknown> = {};
  if (src) {
    try {
      const parsed = JSON.parse(readFileSync(src, "utf8")) as unknown;
      if (parsed && typeof parsed === "object") base = parsed as Record<string, unknown>;
    } catch {
      /* unreadable parent config: fall back to overrides only */
    }
  }
  const parentMcp = typeof base.MCP_SERVERS === "string" ? (base.MCP_SERVERS as string) : process.env.MCP_SERVERS;
  // 子代理一律禁止再 spawn 子代理：把 spawn_agent 并入 SAFETY_DENY_TOOLS（safety 扩展按工具名硬拦），
  // 与 index.ts 的 PI_IS_SUBAGENT 守卫互为独立的双重防线；且经派生 runtime-config 落盘，
  // 不只依赖 env 单链传递，更可靠。保留 extraEnv（profile）已有的 deny 列表。
  const denyTools = new Set(
    (extraEnv.SAFETY_DENY_TOOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  denyTools.add("spawn_agent");
  // 探索子代理也禁止再发起探索（与 spawn_agent 同款防递归）。
  denyTools.add("explore_context");
  const env: Record<string, string> = {
    ...extraEnv,
    ...SUBAGENT_MEMORY_OFF,
    SAFETY_DENY_TOOLS: Array.from(denyTools).join(","),
    MCP_SERVERS: resolveMcpServers(mcp, parentMcp),
  };
  if (!src) return { path: undefined, env, cleanup: () => {} };
  const merged = { ...base, ...env };
  const path = join(tmpdir(), `pi-subagent-rc-${randomBytes(4).toString("hex")}.json`);
  try {
    // 0o600：派生配置全量继承父 runtime-config（含 MCP_SERVERS 等可能带 token 的字段），
    // 落到共享 tmpdir 时限制为仅本用户可读，避免多用户机（Linux /tmp）上被同机其他用户读取。
    writeFileSync(path, JSON.stringify(merged), { encoding: "utf8", mode: 0o600 });
  } catch {
    return { path: undefined, env, cleanup: () => {} };
  }
  return {
    path,
    env,
    cleanup: () => {
      try {
        rmSync(path, { force: true });
      } catch {
        /* already gone / locked: nothing to do */
      }
    },
  };
}

export async function spawnPiAgent(
  cwd: string,
  task: string,
  opts: {
    model?: string;
    signal?: AbortSignal;
    onUpdate?: (update: AgentUpdate) => void;
    env?: Record<string, string>;
    timeoutMs?: number;
    mcp?: boolean | string[];
    /** Named-agent system prompt → written to a temp file and passed via --append-system-prompt. */
    systemPrompt?: string;
    /** Named-agent tool allowlist → passed via --tools. */
    tools?: string[];
  } = {},
): Promise<AgentResult> {
  const { cmd, baseArgs } = resolvePiCommand();
  // --no-approve: sub-agents are isolated one-shot runs that must NOT load
  // project-local .pi resources (extensions / MCP / skills / SYSTEM.md). Pinning
  // it keeps them lightweight and deterministic regardless of the user's global
  // defaultProjectTrust — an "always" setting would otherwise make every
  // sub-agent re-load project-local MCP, re-creating the cold-start stampede.
  const args = [...baseArgs, "--mode", "json", "-p", "--no-session", "--no-approve"];
  const model = opts.model ?? resolveSubagentModel();
  if (model) args.push("--model", model);
  if (opts.tools && opts.tools.length > 0) args.push("--tools", opts.tools.join(","));
  // Named-agent system prompt: write to a temp .md, append via --append-system-prompt,
  // and clean it up when the run finishes (cleanupPrompt in finish below).
  let promptFile: string | undefined;
  if (opts.systemPrompt && opts.systemPrompt.trim()) {
    promptFile = join(tmpdir(), `pi-subagent-sp-${randomBytes(4).toString("hex")}.md`);
    try {
      writeFileSync(promptFile, opts.systemPrompt, { encoding: "utf8", mode: 0o600 });
      args.push("--append-system-prompt", promptFile);
    } catch {
      promptFile = undefined;
    }
  }
  args.push(task);

  return new Promise<AgentResult>((resolve) => {
    const rc = buildSubagentRuntimeConfig(opts.mcp, opts.env);
    const cleanupPrompt = (): void => {
      if (!promptFile) return;
      try {
        rmSync(promptFile, { force: true });
      } catch {
        /* already gone */
      }
      promptFile = undefined;
    };
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    // 流式 onUpdate 节流：子代理 `--mode json` 的每个 message_update 行都带「截至当前的完整消息」，
    // 故 stdout 随单条消息呈 O(n²) 膨胀。若每个 stdout chunk（≈每 token）都回调，就会每 token
    // 重解析整段 stdout（extractFinalText）并把全量 transcript 经 IPC 推到前端，造成「子代理一跑界面就卡」。
    // 这里把回调收敛到至多每 streamThrottleMs 一次（leading + trailing），终态由 finish 的完整 transcript 兜底。
    let emitTimer: ReturnType<typeof setTimeout> | undefined;
    let lastEmitAt = 0;
    const streamThrottleMs = Number(getConfig("SUBAGENT_STREAM_THROTTLE_MS") ?? "") || 150;
    const finish = (r: AgentResult) => {
      if (settled) return;
      settled = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      if (emitTimer) clearTimeout(emitTimer);
      rc.cleanup();
      cleanupPrompt();
      resolve(r);
    };

    const child = spawn(cmd, args, {
      cwd,
      // print mode reads piped stdin; without "ignore" the child blocks waiting
      // for stdin EOF and never runs the task → sub-agent appears to "time out".
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // rc.env = profile env (fs/net/tools) + memory-off + the resolved
        // MCP_SERVERS (on-demand per profile.mcp). Applied BOTH as env and inside
        // the derived runtime-config file (rc.path) below — getConfig reads the
        // file first, so env alone can't undo a value already in PI_RUNTIME_CONFIG.
        ...rc.env,
        // Point the child at the derived sub-agent config so the overrides also
        // win at the file level. Omitted when there is no parent config file —
        // then the env above is already authoritative.
        ...(rc.path ? { PI_RUNTIME_CONFIG: rc.path } : {}),
        // Tag every spawned child as a sub-agent so it refuses to spawn its own
        // sub-agents (recursion guard). Set last so callers can't override it.
        PI_IS_SUBAGENT: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    let doneSeen = false;

    // 在发射时刻才对当前 stdout 快照算 text/transcript；text 用 getter 惰性求值——并行/链式/后台
    // 路径的 onUpdate 只做心跳（registry.touch）、不读 payload，因此它们完全不触发 extractFinalText。
    const emitUpdate = (): void => {
      if (!opts.onUpdate) return;
      lastEmitAt = Date.now();
      const snapshot = stdout;
      opts.onUpdate({
        get text() {
          return extractFinalText(snapshot);
        },
        transcript: snapshot,
      });
    };
    const scheduleEmit = (): void => {
      if (!opts.onUpdate) return;
      const elapsed = Date.now() - lastEmitAt;
      if (elapsed >= streamThrottleMs) {
        if (emitTimer) {
          clearTimeout(emitTimer);
          emitTimer = undefined;
        }
        emitUpdate();
        return;
      }
      if (!emitTimer) {
        emitTimer = setTimeout(() => {
          emitTimer = undefined;
          if (!settled) emitUpdate();
        }, streamThrottleMs - elapsed);
      }
    };

    // Kill the child AND its descendants. A one-shot sub-agent may have spawned
    // MCP stdio servers (or other helpers) whose open pipes keep the process tree
    // alive; child.kill() alone leaves them orphaned, so on Windows use taskkill
    // /T to take down the whole tree.
    const killTree = (): void => {
      const pid = child.pid;
      if (pid && process.platform === "win32") {
        try {
          spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
          return;
        } catch {
          /* fall through to child.kill */
        }
      }
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    };

    // Idle timeout: a sub-agent is "stuck" only when it emits no output for
    // idleMs — not when its total runtime exceeds a fixed budget. Every chunk of
    // real output re-arms the timer, so a slow-but-working agent is never killed
    // mid-flight. A generous hard cap (SUBAGENT_MAX_MS, default idle x10) still
    // bounds the worst case (e.g. an agent that dribbles output forever).
    const idleMs = opts.timeoutMs ?? timeoutMs();
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        killTree();
        finish({ ok: false, output: extractFinalText(stdout), exitCode: -1, error: `idle timeout: no output for ${Math.round(idleMs / 1000)}s`, transcript: stdout });
      }, idleMs);
    };
    armIdle();

    const maxMs = Number(getConfig("SUBAGENT_MAX_MS") ?? "") || idleMs * 10;
    hardTimer = setTimeout(() => {
      killTree();
      finish({ ok: false, output: extractFinalText(stdout), exitCode: -1, error: `hard timeout after ${Math.round(maxMs / 1000)}s`, transcript: stdout });
    }, maxMs);

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
      armIdle(); // progress → re-arm idle timer
      scheduleEmit(); // 节流回调：避免每 token 全量重解析 + 全量 transcript 经 IPC 推送
      // Completion short-circuit: a one-shot sub-agent's `close` may never fire
      // because lingering extension resources (MCP children, watchers, embedding
      // clients…) keep the event loop alive. As soon as the agent signals it is
      // done, give a brief grace for trailing bytes, then finish + kill the tree
      // so we never wait out the idle/hard timeout.
      if (!doneSeen && /"type"\s*:\s*"agent_end"/.test(stdout)) {
        doneSeen = true;
        setTimeout(() => {
          if (settled) return;
          killTree();
          finish({ ok: true, output: extractFinalText(stdout), exitCode: 0, transcript: stdout });
        }, 600);
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    opts.signal?.addEventListener(
      "abort",
      () => {
        killTree();
        finish({ ok: false, output: extractFinalText(stdout), exitCode: -1, error: "aborted", transcript: stdout });
      },
      { once: true },
    );

    child.on("error", (e) => finish({ ok: false, output: "", exitCode: -1, error: e.message, transcript: stdout }));
    child.on("close", (code) =>
      finish({
        ok: code === 0,
        output: extractFinalText(stdout),
        exitCode: code ?? -1,
        error: code === 0 ? undefined : stderr.slice(0, 2000) || undefined,
        transcript: stdout,
      }),
    );
  });
}
