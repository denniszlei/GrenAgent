import { winToWslPath } from "./paths.js";
import type { SandboxSpec } from "./types.js";

export interface SrtSettings {
  filesystem: { denyRead: string[]; allowWrite: string[]; denyWrite: string[] };
  network: { allowedDomains: string[]; deniedDomains: string[] };
}

// 生成 ~/.srt-settings.json 等价内容：写默认拒（只放开 workspace + /tmp），网络默认拒（空 allowlist）。
export function buildSrtSettings(spec: SandboxSpec, wslCwd: string): SrtSettings {
  const roots = (spec.writableRoots && spec.writableRoots.length > 0 ? spec.writableRoots : [spec.cwd]).map(winToWslPath);
  if (!roots.includes(wslCwd)) roots.unshift(wslCwd);
  const allowWrite = [...new Set([...roots, "/tmp"])];
  const allowedDomains = spec.network && spec.network !== "none" ? spec.network.allowDomains : [];
  return {
    filesystem: { denyRead: [], allowWrite, denyWrite: [] },
    network: { allowedDomains, deniedDomains: [] },
  };
}
