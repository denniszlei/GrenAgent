import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "./store.js";

const dirs: string[] = [];
const opened: CheckpointStore[] = [];
function newStore(): CheckpointStore {
  const dir = mkdtempSync(join(tmpdir(), "cp-store-"));
  dirs.push(dir);
  const s = new CheckpointStore(join(dir, "meta.db"));
  opened.push(s);
  s.load();
  return s;
}
afterEach(() => {
  for (const s of opened.splice(0)) {
    try {
      s.close();
    } catch {
      /* closed */
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("CheckpointStore", () => {
  it("adds and lists newest-first with a generated id", () => {
    const s = newStore();
    const { id } = s.add({ hash: "abc123", label: "fix bug", kind: "auto", files: '[{"file":"a.ts","status":"M"}]' });
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, hash: "abc123", label: "fix bug", kind: "auto" });
  });

  it("getById returns the row; clear empties", () => {
    const s = newStore();
    const { id } = s.add({ hash: "h", label: "l", kind: "manual", files: "[]" });
    expect(s.getById(id)?.hash).toBe("h");
    s.clear();
    expect(s.list()).toEqual([]);
    expect(s.getById(id)).toBeUndefined();
  });
});
