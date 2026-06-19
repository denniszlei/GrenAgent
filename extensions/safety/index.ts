import type { ExtensionAPI, ProjectTrustEventResult } from "@earendil-works/pi-coding-agent";
import { extractPath, isDangerousBash, isMutatingBash, isUnderCwd, matchProtectedPath, matchWriteAllowed } from "./rules.js";
import { getApprovalPolicy } from "../_shared/approval.js";
import { getConfig } from "../_shared/runtime-config.js";
import { sandboxOn } from "../_shared/sandbox-gate.js";

const off = (v: string | undefined) => v === "0" || v?.toLowerCase() === "false";
const NET_TOOLS = new Set(["web_search", "web_fetch", "web_crawler"]);

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // 审批策略（与模式正交）：full 放行一切；ask 额外对越界写/联网弹确认；auto 维持既有门控。
    const policy = getApprovalPolicy();
    if (policy === "full") return undefined;

    // 沙箱激活时（SANDBOX_ENABLE!=off 且策略!=full 且沙箱可用）禁内置 bash，steer 到 sandbox_sh。
    if (event.toolName === "bash" && (await sandboxOn())) {
      return {
        block: true,
        reason: "沙箱模式：内置 bash 已禁用，请改用 sandbox_sh（隔离环境执行，写限 workspace、网络默认禁）。",
      };
    }

    // 请求批准（ask）：写工作区外文件 / 联网 → 逐次确认（无 UI 则默认拒绝）。
    if (policy === "ask") {
      if (NET_TOOLS.has(event.toolName)) {
        if (!ctx.hasUI) return { block: true, reason: "请求批准模式：无 UI，默认拒绝联网" };
        const choice = await ctx.ui.select(`请求批准：允许联网？\n\n  工具：${event.toolName}`, ["允许", "拒绝"]);
        if (choice !== "允许") return { block: true, reason: "用户拒绝联网" };
      }
      if (event.toolName === "write" || event.toolName === "edit") {
        const p = extractPath((event.input ?? {}) as Record<string, unknown>);
        if (p && !isUnderCwd(p, ctx.cwd)) {
          if (!ctx.hasUI) return { block: true, reason: "请求批准模式：无 UI，默认拒绝越界写" };
          const choice = await ctx.ui.select(`请求批准：允许写工作区外文件？\n\n  ${p}`, ["允许", "拒绝"]);
          if (choice !== "允许") return { block: true, reason: "用户拒绝越界写" };
        }
      }
    }

    const guardBash = !off(getConfig("SAFETY_BASH_CONFIRM"));
    const guardPaths = !off(getConfig("SAFETY_PROTECT_PATHS"));

    // Capability-profile gating. Prefer per-subagent injected process.env over the
    // global runtime config so a sub-agent's tightening cannot be loosened by (or
    // leak into) the main agent.
    const on = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";
    const readonly = on(process.env.SAFETY_READONLY ?? getConfig("SAFETY_READONLY"));
    const writeAllow = (process.env.SAFETY_WRITE_ALLOW ?? getConfig("SAFETY_WRITE_ALLOW") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const denyTools = (process.env.SAFETY_DENY_TOOLS ?? getConfig("SAFETY_DENY_TOOLS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (denyTools.includes(event.toolName)) {
      return { block: true, reason: `能力档案禁用工具：${event.toolName}` };
    }
    if (readonly) {
      if (event.toolName === "write" || event.toolName === "edit") {
        const p = extractPath((event.input ?? {}) as Record<string, unknown>);
        if (!p || !matchWriteAllowed(p, writeAllow)) {
          return { block: true, reason: `只读模式：仅允许写 ${writeAllow.join(", ") || "(无)"}` };
        }
      }
      if (event.toolName === "bash" && isMutatingBash(String(event.input?.command ?? ""))) {
        return { block: true, reason: "只读模式：禁止会改动文件系统的命令" };
      }
    }
    if (guardBash && event.toolName === "bash") {
      const command = String(event.input?.command ?? "");
      if (isDangerousBash(command)) {
        if (!ctx.hasUI) return { block: true, reason: "Dangerous command blocked (no UI)" };
        const choice = await ctx.ui.select(`⚠️ 危险命令：\n\n  ${command}\n\n是否允许？`, ["允许", "拒绝"]);
        if (choice !== "允许") return { block: true, reason: "用户拒绝执行" };
      }
    }
    if (guardPaths && (event.toolName === "write" || event.toolName === "edit")) {
      const p = extractPath((event.input ?? {}) as Record<string, unknown>);
      if (p && matchProtectedPath(p)) {
        return { block: true, reason: `受保护路径，已阻止写入：${p}` };
      }
    }
    return undefined;
  });

  // project_trust 必须返回 { trusted: "yes"|"no"|"undecided" }（官方 ProjectTrustEventResult），不是 block。
  // ctx 为特化 ProjectTrustContext：仅 cwd/mode/hasUI + ui.{select,confirm,input,notify}。
  pi.on("project_trust", async (event, ctx): Promise<ProjectTrustEventResult> => {
    if (!ctx.hasUI) return { trusted: "undecided" };
    const ok = await ctx.ui.confirm("项目信任", `信任此工作区并允许写入/执行命令？\n${event.cwd}`);
    return ok ? { trusted: "yes", remember: true } : { trusted: "no" };
  });
}
