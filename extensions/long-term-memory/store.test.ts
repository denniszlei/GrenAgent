import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./store.js";

// 确定性 embedding：3 维，按字符码分桶累加；同义近文本向量相近。
vi.mock("./embedding.js", async (orig) => {
  const actual = await orig<typeof import("./embedding.js")>();
  return {
    ...actual,
    embedTexts: vi.fn(async (texts: string[]) =>
      texts.map((t) => {
        const v = [0, 0, 0];
        for (let i = 0; i < t.length; i++) v[i % 3] += t.charCodeAt(i);
        return v;
      }),
    ),
  };
});

const OFF = { enabled: false, baseUrl: "", apiKey: "", model: "" };
const ON = { enabled: true, baseUrl: "x", apiKey: "x", model: "x" };
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

describe("recall filters + vector cache", () => {
  it("filters by category via SQL before scoring (keyword path)", async () => {
    const s = newStore();
    await s.insert("topic alpha", "preference", OFF, "t");
    await s.insert("topic beta", "fact", OFF, "t");
    // query 同时匹配两条；仅 category 过滤能把 fact 排除。
    const hits = await s.recall("topic", 5, OFF, undefined, { categories: ["preference"] });
    expect(hits.map((h) => h.memory.text)).toEqual(["topic alpha"]);
  });

  it("filters by createdAt range", async () => {
    const s = newStore();
    await s.insert("old fact", null, OFF, "t");
    await new Promise((r) => setTimeout(r, 2));
    const b = await s.insert("new fact", null, OFF, "t");
    const from = s.getById(b.id)!.createdAt;
    const hits = await s.recall("fact", 5, OFF, undefined, { from });
    expect(hits.map((h) => h.memory.text)).toEqual(["new fact"]);
  });

  it("vector recall uses cache and ranks by similarity", async () => {
    const s = newStore();
    await s.insert("alpha alpha alpha", null, ON, "t");
    await s.insert("zzzzzz", null, ON, "t");
    const hits = await s.recall("alpha alpha alpha", 2, ON);
    expect(hits[0].memory.text).toBe("alpha alpha alpha");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("cache stays consistent after update/remove", async () => {
    const s = newStore();
    const { id } = await s.insert("alpha", null, ON, "t");
    await s.recall("alpha", 1, ON);
    await s.update(id, { text: "beta beta" }, ON, "u");
    const hits = await s.recall("beta beta", 1, ON);
    expect(hits[0].memory.text).toBe("beta beta");
    s.remove(id, "x");
    expect(await s.recall("beta beta", 1, ON)).toHaveLength(0);
  });

  it("recall bumps useCount which raises a memory's score over repeats", async () => {
    const s = newStore();
    const a = await s.insert("topic alpha", null, ON, "t");
    await s.insert("topic gamma", null, ON, "t");
    const scoreOf = async () =>
      (await s.recall("topic alpha", 5, ON)).find((h) => h.memory.id === a.id)!.score;
    const before = await scoreOf(); // 评分时 useCount=0，随后命中累计
    await scoreOf();
    await scoreOf();
    const after = await scoreOf(); // useCount 已累计，usage 项抬高 score
    expect(after).toBeGreaterThan(before);
  });
});
