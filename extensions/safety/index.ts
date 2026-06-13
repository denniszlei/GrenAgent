import type { ExtensionAPI, ProjectTrustEventResult } from "@earendil-works/pi-coding-agent";
import { extractPath, isDangerousBash, matchProtectedPath } from "./rules.js";

const off = (v: string | undefined) => v === "0" || v?.toLowerCase() === "false";

export default function (pi: ExtensionAPI) {
  const guardBash = !off(process.env.SAFETY_BASH_CONFIRM);
  const guardPaths = !off(process.env.SAFETY_PROTECT_PATHS);

  pi.on("tool_call", async (event, ctx) => {
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
