import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SubAgentRegistry } from "./registry.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function reg(): SubAgentRegistry {
  const dir = mkdtempSync(join(tmpdir(), "sa-reg-"));
  dirs.push(dir);
  const r = new SubAgentRegistry(join(dir, "registry.db"));
  r.load();
  return r;
}

describe("SubAgentRegistry", () => {
  it("create → get returns a running row", () => {
    const r = reg();
    const id = SubAgentRegistry.genId();
    r.create({ id, task: "do x", model: "m1" });
    const row = r.get(id);
    expect(row?.status).toBe("running");
    expect(row?.task).toBe("do x");
    expect(row?.model).toBe("m1");
    r.close();
  });

  it("finish updates status/output/exitCode", () => {
    const r = reg();
    const id = SubAgentRegistry.genId();
    r.create({ id, task: "t" });
    r.finish(id, { status: "done", output: "result", exitCode: 0 });
    const row = r.get(id);
    expect(row?.status).toBe("done");
    expect(row?.output).toBe("result");
    expect(row?.exitCode).toBe(0);
    r.close();
  });

  it("list returns rows", () => {
    const r = reg();
    r.create({ id: "sa-aaaaaaaa", task: "a" });
    r.create({ id: "sa-bbbbbbbb", task: "b" });
    const ids = r.list().map((x) => x.id);
    expect(ids).toContain("sa-aaaaaaaa");
    expect(ids).toContain("sa-bbbbbbbb");
    r.close();
  });

  it("genId has sa- prefix and is unique", () => {
    expect(SubAgentRegistry.genId()).toMatch(/^sa-[0-9a-f]{8}$/);
    expect(SubAgentRegistry.genId()).not.toBe(SubAgentRegistry.genId());
  });

  it("reapOrphans marks leftover running rows as error", () => {
    const r = reg();
    r.create({ id: "sa-orphan00", task: "t" });
    const n = r.reapOrphans();
    expect(n).toBe(1);
    expect(r.get("sa-orphan00")?.status).toBe("error");
    expect(r.get("sa-orphan00")?.error).toContain("orphaned");
    r.close();
  });
});
