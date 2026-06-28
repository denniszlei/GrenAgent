import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { daysToMs, readMarker, shouldRun, writeMarker } from "./schedule.js";

const base = {
  enabled: true,
  intervalMs: daysToMs(7),
  lastRunMs: undefined as number | undefined,
  earliestSessionMs: undefined as number | undefined,
  latestSessionMs: undefined as number | undefined,
  now: 1_000_000_000_000,
  lastSpawnMs: 0,
};

describe("shouldRun", () => {
  it("disabled → false", () => {
    expect(shouldRun({ ...base, enabled: false, earliestSessionMs: base.now - daysToMs(30) })).toBe(false);
  });
  it("within spawn debounce → false", () => {
    expect(shouldRun({ ...base, earliestSessionMs: base.now - daysToMs(30), lastSpawnMs: base.now - 1000 })).toBe(false);
  });
  it("first run + project too young → false", () => {
    expect(shouldRun({ ...base, earliestSessionMs: base.now - daysToMs(3) })).toBe(false);
  });
  it("first run + no sessions → false", () => {
    expect(shouldRun({ ...base, earliestSessionMs: undefined })).toBe(false);
  });
  it("first run + project old enough → true", () => {
    expect(shouldRun({ ...base, earliestSessionMs: base.now - daysToMs(10) })).toBe(true);
  });
  it("last run too recent → false", () => {
    expect(shouldRun({ ...base, lastRunMs: base.now - daysToMs(3) })).toBe(false);
  });
  it("interval met + new activity since last run → true", () => {
    expect(
      shouldRun({
        ...base,
        lastRunMs: base.now - daysToMs(8),
        latestSessionMs: base.now - daysToMs(1),
      }),
    ).toBe(true);
  });
  it("interval met but no new activity since last run → false", () => {
    expect(
      shouldRun({
        ...base,
        lastRunMs: base.now - daysToMs(8),
        latestSessionMs: base.now - daysToMs(9),
      }),
    ).toBe(false);
  });
  it("interval met but no sessions (latest undefined) → false", () => {
    expect(
      shouldRun({ ...base, lastRunMs: base.now - daysToMs(8), latestSessionMs: undefined }),
    ).toBe(false);
  });
  it("interval 0 + new activity → true (past debounce)", () => {
    expect(
      shouldRun({
        ...base,
        intervalMs: 0,
        lastRunMs: base.now - 1000,
        latestSessionMs: base.now,
      }),
    ).toBe(true);
  });
});

describe("marker IO", () => {
  it("write then read roundtrips", () => {
    const dir = mkdtempSync(join(tmpdir(), "se-"));
    try {
      const f = join(dir, "sub", ".marker");
      expect(readMarker(f)).toBeUndefined();
      writeMarker(f, 123456);
      expect(readMarker(f)).toBe(123456);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  it("read missing → undefined", () => {
    expect(readMarker(join(tmpdir(), "definitely-missing-se-marker"))).toBeUndefined();
  });
});
