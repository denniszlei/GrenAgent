import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listCodeFiles } from "./files.js";

describe("listCodeFiles", () => {
  it("lists matching files and skips node_modules / dotdirs", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-"));
    writeFileSync(join(dir, "a.ts"), "export const a = 1;");
    writeFileSync(join(dir, "b.md"), "# doc");
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "dep.ts"), "skip me");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "c.ts"), "export const c = 2;");

    const files = listCodeFiles(dir, new Set([".ts"])).map((f) => f.replace(/\\/g, "/"));
    expect(files.some((f) => f.endsWith("/a.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("/src/c.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("b.md"))).toBe(false);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  });
});
