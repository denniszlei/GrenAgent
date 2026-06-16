import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CodeIndex } from "./store.js";

describe("CodeIndex", () => {
  it("replaceFile then all round-trips rows and vectors; mtimeOf reports mtime", () => {
    const dir = mkdtempSync(join(tmpdir(), "cs-"));
    const idx = new CodeIndex(join(dir, ".pi", "code-index", "index.db"));
    try {
      idx.replaceFile("a.ts", 111, [{ startLine: 1, endLine: 2, text: "const a=1", vector: [0.5, -0.25] }]);
      expect(idx.mtimeOf("a.ts")).toBe(111);
      const rows = idx.all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ file: "a.ts", startLine: 1, endLine: 2, mtime: 111, text: "const a=1" });
      expect(rows[0].vector[0]).toBeCloseTo(0.5, 5);
      expect(rows[0].vector[1]).toBeCloseTo(-0.25, 5);
    } finally {
      idx.close();
    }
  });
});
