import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCancelRequest, cancelRequestPath, cancelSubAgent, drainCancelRequests, installCancelWatcher } from "./cancel.js";
import { SubAgentRegistry } from "./registry.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tmpCwd(): string {
  const dir = mkdtempSync(join(tmpdir(), "sa-cancel-"));
  dirs.push(dir);
  return dir;
}

describe("cancel requests", () => {
  it("appendCancelRequest writes jsonl line", () => {
    const cwd = tmpCwd();
    appendCancelRequest(cwd, "sa-abc");
    const raw = readFileSync(cancelRequestPath(cwd), "utf8").trim();
    expect(JSON.parse(raw).agentId).toBe("sa-abc");
  });

  it("drain processes only new lines", () => {
    const cwd = tmpCwd();
    const seen: string[] = [];
    const offset = { lines: 0 };
    mkdirSync(join(cwd, ".pi", "subagents"), { recursive: true });
    writeFileSync(cancelRequestPath(cwd), '{"agentId":"sa-1"}\n', "utf8");
    drainCancelRequests(cwd, offset, (id) => seen.push(id));
    expect(seen).toEqual(["sa-1"]);
    appendCancelRequest(cwd, "sa-2");
    drainCancelRequests(cwd, offset, (id) => seen.push(id));
    expect(seen).toEqual(["sa-1", "sa-2"]);
  });

  it("cancelSubAgent aborts inflight and marks cancelled", () => {
    const cwd = tmpCwd();
    const reg = new SubAgentRegistry(join(cwd, "registry.db"));
    reg.load();
    const id = SubAgentRegistry.genId();
    reg.create({ id, task: "t" });
    const controller = new AbortController();
    const inflight = new Map<string, AbortController>([[id, controller]]);
    cancelSubAgent(id, reg, inflight);
    expect(controller.signal.aborted).toBe(true);
    expect(reg.get(id)?.status).toBe("cancelled");
    expect(inflight.has(id)).toBe(false);
    reg.close();
  });

  it("installCancelWatcher invokes handler for appended requests", async () => {
    const cwd = tmpCwd();
    const seen: string[] = [];
    installCancelWatcher(cwd, (id) => seen.push(id));
    appendCancelRequest(cwd, "sa-watch");
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toContain("sa-watch");
  });
});
