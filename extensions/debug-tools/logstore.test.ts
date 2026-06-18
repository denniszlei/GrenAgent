import { describe, expect, it } from "vitest";
import { LogStore } from "./logstore.js";

describe("LogStore", () => {
  it("assigns monotonic seq and defaults tag/data", () => {
    const s = new LogStore();
    const a = s.push({ tag: "x", data: { v: 1 }, ts: 1000 });
    const b = s.push({});
    expect(a.seq).toBe(1);
    expect(a.ts).toBe(1000);
    expect(a.tag).toBe("x");
    expect(b.seq).toBe(2);
    expect(b.tag).toBe("log");
    expect(b.data).toBeNull();
    expect(s.size()).toBe(2);
  });

  it("evicts oldest beyond capacity and counts drops", () => {
    const s = new LogStore(2);
    s.push({ tag: "a" });
    s.push({ tag: "b" });
    s.push({ tag: "c" });
    expect(s.size()).toBe(2);
    expect(s.droppedCount()).toBe(1);
    const tags = s.readAll().map((e) => e.tag);
    expect(tags).toEqual(["b", "c"]);
  });

  it("clear resets entries, seq and dropped", () => {
    const s = new LogStore(1);
    s.push({ tag: "a" });
    s.push({ tag: "b" });
    expect(s.droppedCount()).toBe(1);
    s.clear();
    expect(s.size()).toBe(0);
    expect(s.droppedCount()).toBe(0);
    expect(s.push({ tag: "c" }).seq).toBe(1);
  });

  it("formats entries with seq, tag and json data", () => {
    const s = new LogStore();
    s.push({ tag: "hypo1", data: { count: 3 }, ts: Date.UTC(2026, 0, 1, 12, 0, 0) });
    const out = s.formatForAgent();
    expect(out).toContain("#1");
    expect(out).toContain("[hypo1]");
    expect(out).toContain('{"count":3}');
  });

  it("read limit returns only the last N", () => {
    const s = new LogStore();
    for (let i = 0; i < 5; i++) s.push({ tag: `t${i}` });
    const out = s.formatForAgent(2);
    expect(out).toContain("[t3]");
    expect(out).toContain("[t4]");
    expect(out).not.toContain("[t0]");
  });

  it("reports empty state", () => {
    expect(new LogStore().formatForAgent()).toBe("(no logs captured yet)");
  });
});
