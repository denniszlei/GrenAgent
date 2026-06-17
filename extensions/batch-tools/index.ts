// batch-tools 扩展入口：默认注册 read_files / search。BATCH_TOOLS_ENABLED=0 关闭。
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { registerReadFiles } from "./read-files.js";
import { registerSearch } from "./search.js";

export default function (pi: ExtensionAPI): void {
  if ((getConfig("BATCH_TOOLS_ENABLED") ?? "1") === "0") return;
  registerReadFiles(pi);
  registerSearch(pi);
}
