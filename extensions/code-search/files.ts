import { type Dirent, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".pi",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "target",
  "vendor",
]);

/** Recursively list code files under `root` whose extension is in `exts`. */
export function listCodeFiles(root: string, exts: Set<string>, maxFiles = 2000): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
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
      } else if (e.isFile() && exts.has(extname(e.name))) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}
