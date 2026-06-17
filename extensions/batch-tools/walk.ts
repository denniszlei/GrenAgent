// 文件枚举 + 轻量 glob->regex。复用 code-search/files.ts 的目录跳过策略，
// 额外支持 glob 过滤、单文件字节上限与枚举上限。无外部依赖、跨平台。
import { type Dirent, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".pi", "dist", "build", "out", ".next", "coverage", "target", "vendor",
]);

/** glob -> RegExp：`*`=单段、`**`=任意层(可零，吃掉随后的 /)、`?`=单个非斜杠字符；其余正则元字符转义。匹配相对 POSIX 路径。 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** 任一 glob 命中即真；无 glob 视为全通过。先把分隔符归一化为 /。 */
export function matchesAnyGlob(relPath: string, globs: RegExp[]): boolean {
  if (!globs.length) return true;
  const p = relPath.split(sep).join("/").split("\\").join("/");
  return globs.some((g) => g.test(p));
}

/** 递归枚举 root 下文件（glob 过滤、跳过 SKIP_DIRS/隐藏目录、文件数与单文件字节上限）。 */
export function walkFiles(
  root: string,
  opts: { globs?: string[]; maxFiles?: number; maxFileBytes?: number } = {},
): string[] {
  const maxFiles = opts.maxFiles ?? 5000;
  const maxFileBytes = opts.maxFileBytes ?? 1048576;
  const globs = (opts.globs ?? []).map(globToRegExp);
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (out.length >= maxFiles) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(full);
      } else if (e.isFile()) {
        if (!matchesAnyGlob(relative(root, full), globs)) continue;
        try {
          if (statSync(full).size > maxFileBytes) continue;
        } catch {
          continue;
        }
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}
