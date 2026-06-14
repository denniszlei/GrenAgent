import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./store.js";

const OFF = { enabled: false, baseUrl: "", apiKey: "", model: "" };
const dirs: string[] = [];
const opened: MemoryStore[] = [];
function track<T extends MemoryStore>(s: T): T {
  opened.push(s);
  return s;
}
function newStore(): MemoryStore {
  const dir = mkdtempSync(join(tmpdir(), "memtest-"));
  dirs.push(dir);
  const s = track(new MemoryStore(join(dir, "memory.db")));
  s.load();
  return s;
}
afterEach(() => {
  // Close DB handles before removing files (Windows locks open sqlite files).
  for (const s of opened.splice(0)) {
    try {
      s.close();
    } catch {
      /* already closed */
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("MemoryStore smart ops", () => {
  it("insert creates a stable id, records ADD history", async () => {
    const s = newStore();
    const { id } = await s.insert("uses pnpm", "preference", OFF, "test");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(s.getById(id)?.text).toBe("uses pnpm");
    const h = s.history(id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ op: "ADD", newText: "uses pnpm", oldText: null, version: 1 });
  });

  it("update changes text, bumps version, records UPDATE history (id stable)", async () => {
    const s = newStore();
    const { id } = await s.insert("uses npm", "preference", OFF, "init");
    const res = await s.update(id, { text: "uses pnpm" }, OFF, "switched");
    expect(res?.version).toBe(2);
    expect(s.getById(id)?.text).toBe("uses pnpm");
    const h = s.history(id);
    expect(h[0]).toMatchObject({ op: "UPDATE", oldText: "uses npm", newText: "uses pnpm", version: 2 });
  });

  it("remove deletes and records DELETE history with oldText", async () => {
    const s = newStore();
    const { id } = await s.insert("temp fact", null, OFF, "init");
    expect(s.remove(id, "obsolete")).toBe(true);
    expect(s.getById(id)).toBeUndefined();
    expect(s.history(id)[0]).toMatchObject({ op: "DELETE", oldText: "temp fact", newText: null });
  });

  it("rollback of an UPDATE restores the previous text", async () => {
    const s = newStore();
    const { id } = await s.insert("uses npm", null, OFF, "init");
    await s.update(id, { text: "uses pnpm" }, OFF, "switch");
    const updateRow = s.history(id).find((r) => r.op === "UPDATE")!;
    await s.rollback(updateRow.historyId, OFF);
    expect(s.getById(id)?.text).toBe("uses npm");
    expect(s.history(id)[0]).toMatchObject({ op: "ROLLBACK", newText: "uses npm" });
  });

  it("rollback of a DELETE re-inserts with same id", async () => {
    const s = newStore();
    const { id } = await s.insert("keep me", null, OFF, "init");
    s.remove(id, "oops");
    const delRow = s.history(id).find((r) => r.op === "DELETE")!;
    await s.rollback(delRow.historyId, OFF);
    expect(s.getById(id)?.text).toBe("keep me");
  });

  it("migrates a legacy db (reopen) without data loss", async () => {
    const dir = mkdtempSync(join(tmpdir(), "memtest-legacy-"));
    dirs.push(dir);
    const file = join(dir, "memory.db");
    const s = new MemoryStore(file);
    s.load();
    await s.insert("legacy ok", null, OFF, "init");
    s.close();
    const reopened = track(new MemoryStore(file));
    reopened.load();
    const first = reopened.list(1)[0];
    expect(reopened.getById(first.id)?.text).toBe("legacy ok");
  });
});
