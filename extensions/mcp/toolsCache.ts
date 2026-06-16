// node-fs 缓存写入：读-合并-原子写 ~/.pi/mcp-tools-cache.json。与 mcp-policy 扩展同样的写法。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProbeResult } from "./probe.js";

const DIR = join(homedir(), ".pi");
const CACHE_PATH = join(DIR, "mcp-tools-cache.json");

export interface ToolsCacheEntry {
  toolNames: string[];
  probedAt: string;
  ok: boolean;
  error?: string;
}

/** 读取工具缓存，返回 { server: 工具名[] }（尽力而为，文件缺失/损坏时返回空）。 */
export function readToolsCache(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const tools = (entry as { toolNames?: unknown })?.toolNames;
      if (Array.isArray(tools)) out[name] = tools.filter((t): t is string => typeof t === "string");
    }
    return out;
  } catch {
    return {};
  }
}

export function writeToolsCacheEntry(name: string, result: ProbeResult): void {
  mkdirSync(DIR, { recursive: true });
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    raw = {};
  }
  const entry: ToolsCacheEntry = {
    toolNames: result.toolNames,
    probedAt: new Date().toISOString(),
    ok: result.ok,
  };
  if (result.error) entry.error = result.error;
  raw[name] = entry;
  const tmp = `${CACHE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(raw, null, 2), "utf8");
  renameSync(tmp, CACHE_PATH);
}
