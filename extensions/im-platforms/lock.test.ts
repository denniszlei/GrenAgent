import { existsSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireLock, pidAlive, refreshLock, releaseLock } from "./lock.js";

const lockPath = join(tmpdir(), `gren-wechat-lock-test-${process.pid}.lock`);
const DEAD_PID = 999_999_999; // 几乎不可能存在的 pid

afterEach(() => {
  rmSync(lockPath, { force: true });
});

describe("single-instance lock", () => {
  it("acquires when free and writes own pid", () => {
    expect(acquireLock(lockPath)).toBe(true);
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
  });

  it("is idempotent for the same holder", () => {
    expect(acquireLock(lockPath)).toBe(true);
    expect(acquireLock(lockPath)).toBe(true);
  });

  it("refuses when a live process already holds it", () => {
    writeFileSync(lockPath, String(process.pid)); // 当前进程（存活）持有
    // 以另一个 pid 身份来抢：持有者存活 → 抢不到。
    expect(acquireLock(lockPath, process.pid + 1)).toBe(false);
  });

  it("steals a stale lock whose holder is dead", () => {
    writeFileSync(lockPath, String(DEAD_PID));
    expect(pidAlive(DEAD_PID)).toBe(false);
    expect(acquireLock(lockPath)).toBe(true); // 陈旧锁被清除并抢占
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid));
  });

  it("release removes only own lock", () => {
    acquireLock(lockPath);
    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("release does not remove another holder's lock", () => {
    writeFileSync(lockPath, String(DEAD_PID));
    releaseLock(lockPath); // 非本进程持有 → 不删
    expect(existsSync(lockPath)).toBe(true);
  });
});

describe("lock heartbeat (stale-by-mtime takeover)", () => {
  it("reclaims a lock whose live holder stopped heartbeating (stale mtime)", () => {
    writeFileSync(lockPath, String(process.pid)); // holder pid is alive (this process)...
    const old = new Date(Date.now() - 5 * 60_000); // ...but its heartbeat lapsed long ago
    utimesSync(lockPath, old, old);
    // A peer pid takes over despite the holder "looking alive" (guards against pid reuse).
    expect(acquireLock(lockPath, process.pid + 1)).toBe(true);
    expect(readFileSync(lockPath, "utf8").trim()).toBe(String(process.pid + 1));
  });

  it("keeps a fresh lock held by a live process (heartbeat current)", () => {
    writeFileSync(lockPath, String(process.pid));
    const now = new Date();
    utimesSync(lockPath, now, now);
    expect(acquireLock(lockPath, process.pid + 1)).toBe(false);
  });

  it("refreshLock bumps the holder's mtime", () => {
    acquireLock(lockPath);
    const stale = new Date(Date.now() - 30_000);
    utimesSync(lockPath, stale, stale);
    refreshLock(lockPath);
    expect(statSync(lockPath).mtimeMs).toBeGreaterThan(stale.getTime());
  });

  it("refreshLock does not touch another holder's lock", () => {
    writeFileSync(lockPath, String(DEAD_PID));
    const stale = new Date(Date.now() - 30_000);
    utimesSync(lockPath, stale, stale);
    const before = statSync(lockPath).mtimeMs;
    refreshLock(lockPath); // we are not the holder → no-op
    expect(statSync(lockPath).mtimeMs).toBe(before);
  });
});
