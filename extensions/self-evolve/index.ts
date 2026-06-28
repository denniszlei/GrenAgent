// extensions/self-evolve: 自进化（dream 知识固化 + distill 行为提炼）。
// before_agent_start 间隔自动触发 registry 子代理（仅在用户真正开始对话的首个 turn 判一次，
// 不挂 session_start，避免桌面端启动 warm 会话时空触发）；/dream /distill 手动触发；
// before_agent_start 同时注入 项目+全局 MEMORY.md。子进程置 SELF_EVOLVE_CHILD 防递归。
import { join } from "node:path";
import { getAgentDir, SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { formatInjection, readMemoryFile } from "./memory-file.js";
import { startEvolveJob, type EvolveJobResult } from "./runner.js";
import { daysToMs, readMarker, shouldRun, writeMarker } from "./schedule.js";
import { seedPersonas } from "./seed.js";

const auto = () => (getConfig("SELF_EVOLVE_AUTO") ?? "1") !== "0";
const dreamDays = () => Number(getConfig("SELF_EVOLVE_DREAM_INTERVAL_DAYS") ?? "7");
const distillDays = () => Number(getConfig("SELF_EVOLVE_DISTILL_INTERVAL_DAYS") ?? "30");
const memInject = () => (getConfig("SELF_EVOLVE_MEMORY_INJECT") ?? "1") !== "0";
const memMaxChars = () => Number(getConfig("SELF_EVOLVE_MEMORY_MAX_CHARS") ?? "4096") || 4096;
const timeoutMs = () => Number(getConfig("SELF_EVOLVE_TIMEOUT_MS") ?? "300000") || 300000;
const model = () => getConfig("SELF_EVOLVE_MODEL")?.trim() || undefined;
const isChild = () => process.env.SELF_EVOLVE_CHILD === "1";

const projectMemory = (cwd: string) => join(cwd, ".pi", "memory", "MEMORY.md");
const globalMemory = () => join(getAgentDir(), "MEMORY.md");
const dreamMarker = (cwd: string) => join(cwd, ".pi", "memory", ".self-evolve-dream");
const distillMarker = (cwd: string) => join(cwd, ".pi", "memory", ".self-evolve-distill");

function sessionModifiedMs(info: { modified?: Date | string | number }): number | undefined {
  if (info.modified === undefined) return undefined;
  const t = +new Date(info.modified);
  return Number.isFinite(t) ? t : undefined;
}

/** 一次扫描取项目会话的最早(年龄门槛)与最近(活动闸)修改时间。 */
async function sessionAgeBounds(cwd: string): Promise<{ earliest?: number; latest?: number }> {
  const infos = await SessionManager.list(cwd).catch(() => []);
  let earliest: number | undefined;
  let latest: number | undefined;
  for (const i of infos) {
    const t = sessionModifiedMs(i);
    if (t === undefined) continue;
    earliest = earliest === undefined ? t : Math.min(earliest, t);
    latest = latest === undefined ? t : Math.max(latest, t);
  }
  return { earliest, latest };
}

function displayLabel(agent: "dream" | "distill", source: "manual" | "auto"): string {
  if (source === "auto") return agent === "dream" ? "Auto Dream" : "Auto Distill";
  return agent === "dream" ? "Dream" : "Distill";
}

function postNotice(pi: ExtensionAPI, customType: string, lines: string[]) {
  pi.sendMessage({ customType, content: lines.join("\n"), display: true }, { triggerTurn: false });
}

function onAutoComplete(pi: ExtensionAPI, agent: "dream" | "distill", r: EvolveJobResult) {
  const label = displayLabel(agent, "auto");
  if (r.ok) {
    const summary = r.output.trim().slice(0, 400) || "（无文本摘要）";
    postNotice(pi, `self-evolve-${agent}-done`, [`- **${label}** 已完成`, `- ${summary}`]);
    return;
  }
  postNotice(pi, `self-evolve-${agent}-error`, [`- **${label}** 失败`, `- ${r.error ?? "unknown error"}`]);
}

function runEvolve(pi: ExtensionAPI, agent: "dream" | "distill", source: "manual" | "auto", ctx: ExtensionContext) {
  const label = displayLabel(agent, source);
  // 模型策略「禁用子代理」也覆盖 self-evolve 的 dream/distill（它们同样是 spawn 出的子代理进程）：
  // 自动触发静默跳过；手动 /dream /distill 给一条提示。
  if (getConfig("SUBAGENT_MODE")?.trim() === "disabled") {
    if (source === "manual") ctx.ui.notify(`子代理已禁用（设置 → 子代理 → 模型策略），已跳过 ${label}。`, "info");
    return;
  }
  const { already } = startEvolveJob(
    { agent, cwd: ctx.cwd, source, model: model(), timeoutMs: timeoutMs() },
    source === "auto" ? { onComplete: (r) => onAutoComplete(pi, agent, r) } : undefined,
  );
  if (already) {
    ctx.ui.notify(`${label} 已在运行中，跳过本次触发。`, "info");
    return;
  }
  ctx.ui.notify(`${label} 已在后台启动；点右上角 Bot 查看进度。`, "info");
  postNotice(pi, `self-evolve-${agent}-start`, [
    `- **${label}** 已在后台运行`,
    "- 点右上角 Bot 图标查看进度与完整 transcript",
  ]);
}

export default function (pi: ExtensionAPI) {
  let lastDreamSpawn = 0;
  let lastDistillSpawn = 0;
  // 每会话只判一次（在该会话的首个 turn）：对齐 MiMo `step === 1` 语义。
  const checkedSessions = new Set<string>();

  seedPersonas();

  // 自动 dream/distill 调度：触发点从「会话创建(session_start)」改到「用户真正开始一次对话
  // (before_agent_start)」。桌面端启动会 warm/open 顶层会话 → 旧的 session_start 钩子会在
  // 「还没对话」时误触发；before_agent_start 仅在有真实 turn 时触发，正对应 MiMo 的 step===1。
  const maybeAutoEvolve = async (ctx: ExtensionContext) => {
    if (isChild() || !auto()) return;
    // 同步去重：在首个 await 前完成，避免同会话连续 turn 重复进入。
    let sid: string | undefined;
    try {
      sid = ctx.sessionManager.getSessionId();
    } catch {
      sid = undefined;
    }
    if (sid) {
      if (checkedSessions.has(sid)) return;
      checkedSessions.add(sid);
    }
    try {
      const now = Date.now();
      const { earliest, latest } = await sessionAgeBounds(ctx.cwd);
      if (
        shouldRun({
          enabled: true,
          intervalMs: daysToMs(dreamDays()),
          lastRunMs: readMarker(dreamMarker(ctx.cwd)),
          earliestSessionMs: earliest,
          latestSessionMs: latest,
          now,
          lastSpawnMs: lastDreamSpawn,
        })
      ) {
        lastDreamSpawn = now;
        writeMarker(dreamMarker(ctx.cwd), now);
        runEvolve(pi, "dream", "auto", ctx);
      }
      if (
        shouldRun({
          enabled: true,
          intervalMs: daysToMs(distillDays()),
          lastRunMs: readMarker(distillMarker(ctx.cwd)),
          earliestSessionMs: earliest,
          latestSessionMs: latest,
          now,
          lastSpawnMs: lastDistillSpawn,
        })
      ) {
        lastDistillSpawn = now;
        writeMarker(distillMarker(ctx.cwd), now);
        runEvolve(pi, "distill", "auto", ctx);
      }
    } catch {
      /* never block the turn */
    }
  };

  pi.on("before_agent_start", async (_event, ctx) => {
    // 调度自动进化（fire-and-forget，不阻塞注入与本轮）。
    void maybeAutoEvolve(ctx);

    // 子代理（dream/distill 自身）不注入 MEMORY 全文：persona 已含主动读 MEMORY 步骤，
    // 再注入既冗余又占用子代理 context（对齐 MiMo「按需查」精神）。主 agent 仍照常注入。
    if (isChild() || !memInject()) return undefined;
    const body = formatInjection(
      readMemoryFile(projectMemory(ctx.cwd)),
      readMemoryFile(globalMemory()),
      memMaxChars(),
    );
    if (!body) return undefined;
    return { message: { customType: "self-evolve-memory", content: body, display: false } };
  });

  pi.registerCommand("dream", {
    description: "立即固化近期会话知识到记忆库与 MEMORY.md（/dream）",
    handler: async (_args, ctx) => {
      writeMarker(dreamMarker(ctx.cwd), Date.now());
      runEvolve(pi, "dream", "manual", ctx);
    },
  });

  pi.registerCommand("distill", {
    description: "立即提炼近期重复工作流为 skill/agent/command（/distill）",
    handler: async (_args, ctx) => {
      writeMarker(distillMarker(ctx.cwd), Date.now());
      runEvolve(pi, "distill", "manual", ctx);
    },
  });
}
