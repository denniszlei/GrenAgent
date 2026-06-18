// 语言服务器候选与探测：按文件扩展名选语言、按语言选服务器、就近识别项目根。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export interface ServerSpec {
  language: string;
  cmd: string;
  args: string[];
  rootMarkers: string[];
}

export const SERVERS: ServerSpec[] = [
  {
    language: "typescript",
    cmd: "typescript-language-server",
    args: ["--stdio"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
  },
  {
    language: "python",
    cmd: "pyright-langserver",
    args: ["--stdio"],
    rootMarkers: ["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"],
  },
  { language: "rust", cmd: "rust-analyzer", args: [], rootMarkers: ["Cargo.toml"] },
  { language: "go", cmd: "gopls", args: ["serve"], rootMarkers: ["go.mod"] },
];

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  jsx: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
};

export function languageForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

export function serverForLanguage(language: string): ServerSpec | undefined {
  return SERVERS.find((s) => s.language === language);
}

// 自给定文件向上找含 rootMarkers 的目录；找不到回退到 fallback（工作区根）。
export function findRoot(filePath: string, markers: string[], fallback: string): string {
  let dir = dirname(filePath);
  const { root } = parse(dir);
  for (;;) {
    if (markers.some((m) => existsSync(join(dir, m)))) return dir;
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return fallback;
}

export function isAvailable(cmd: string): boolean {
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const probe = spawnSync(finder, [cmd], { stdio: "ignore", timeout: 5000 });
    return !probe.error && probe.status === 0;
  } catch {
    return false;
  }
}
