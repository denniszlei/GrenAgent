// LSP 位置/URI 与工具友好表示的互转。工具用 1-based line/column；LSP 用 0-based line/character。
// 注：LSP character 是 UTF-16 偏移，MVP 直接按 column-1 处理（多字节列偏移精修列二期）。
import { fileURLToPath, pathToFileURL } from "node:url";

export function pathToUri(absPath: string): string {
  return pathToFileURL(absPath).toString();
}

export function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

export interface LspPosition {
  line: number;
  character: number;
}

export function toLspPosition(line: number, column: number): LspPosition {
  return { line: Math.max(0, line - 1), character: Math.max(0, column - 1) };
}

export interface LspLocation {
  uri: string;
  range?: { start: LspPosition; end: LspPosition };
}

export interface ToolLocation {
  path: string;
  line: number;
  column: number;
}

export function fromLspLocation(loc: LspLocation): ToolLocation {
  const start = loc.range?.start ?? { line: 0, character: 0 };
  return { path: uriToPath(loc.uri), line: start.line + 1, column: start.character + 1 };
}

// definition/references 的结果可能是 Location | Location[] | LocationLink[]，统一成 ToolLocation[]。
export function normalizeLocations(result: unknown): ToolLocation[] {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const out: ToolLocation[] = [];
  for (const item of arr) {
    const o = item as { uri?: string; targetUri?: string; range?: LspLocation["range"]; targetRange?: LspLocation["range"] };
    const uri = o.uri ?? o.targetUri;
    if (!uri) continue;
    out.push(fromLspLocation({ uri, range: o.range ?? o.targetRange }));
  }
  return out;
}
