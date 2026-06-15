import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig, getAllConfig, __resetForTest } from "./runtime-config.js";

const dirs: string[] = [];
function fileWith(obj: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "rtcfg-"));
  dirs.push(dir);
  const p = join(dir, "runtime-settings.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
afterEach(() => {
  __resetForTest();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  delete process.env.PI_RUNTIME_CONFIG;
  delete process.env.SOME_KEY;
});

describe("runtime-config", () => {
  it("reads value from runtime file", () => {
    process.env.PI_RUNTIME_CONFIG = fileWith({ SOME_KEY: "from-file" });
    expect(getConfig("SOME_KEY")).toBe("from-file");
  });
  it("falls back to process.env when file missing key", () => {
    process.env.PI_RUNTIME_CONFIG = fileWith({});
    process.env.SOME_KEY = "from-env";
    expect(getConfig("SOME_KEY")).toBe("from-env");
  });
  it("falls back to process.env when no PI_RUNTIME_CONFIG", () => {
    process.env.SOME_KEY = "env-only";
    expect(getConfig("SOME_KEY")).toBe("env-only");
  });
  it("getAllConfig merges env + file (file wins)", () => {
    process.env.SOME_KEY = "env";
    process.env.PI_RUNTIME_CONFIG = fileWith({ SOME_KEY: "file" });
    expect(getAllConfig().SOME_KEY).toBe("file");
  });
});
