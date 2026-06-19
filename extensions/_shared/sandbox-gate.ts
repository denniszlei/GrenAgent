import { getApprovalPolicy } from "./approval.js";
import { getConfig } from "./runtime-config.js";
import { getSandbox } from "./sandbox/index.js";

// 统一沙箱判据：SANDBOX_ENABLE=off 总 kill；审批策略 full 不隔离；其余在沙箱可用时隔离。
// 被 code-exec / im-platforms / multi-agent 复用，取代各自原先的 isAvailable/SANDBOX_ENABLE 判断。
export async function sandboxOn(): Promise<boolean> {
  if (getConfig("SANDBOX_ENABLE") === "off") return false;
  if (getApprovalPolicy() === "full") return false;
  return (await getSandbox()).isAvailable();
}
