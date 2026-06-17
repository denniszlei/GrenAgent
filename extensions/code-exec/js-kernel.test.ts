import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { JsKernel } from "./js-kernel.js";

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), "runner.mjs");

describe("JsKernel", () => {
  let k: JsKernel | undefined;
  afterEach(() => k?.dispose());

  it("persists vars across exec and echoes completion value", async () => {
    k = new JsKernel(RUNNER, process.cwd());
    const r1 = await k.exec("var x = 10");
    expect(r1.ok).toBe(true);
    const r2 = await k.exec("x + 5");
    expect(r2.ok).toBe(true);
    expect(r2.value).toBe("15");
  });

  it("captures console output", async () => {
    k = new JsKernel(RUNNER, process.cwd());
    const r = await k.exec("console.log('hi', 42)");
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain("hi 42");
  });

  it("captures errors without killing the kernel", async () => {
    k = new JsKernel(RUNNER, process.cwd());
    const bad = await k.exec("throw new Error('boom')");
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("boom");
    const ok = await k.exec("1 + 1");
    expect(ok.value).toBe("2");
  });

  it("reset clears namespace", async () => {
    k = new JsKernel(RUNNER, process.cwd());
    await k.exec("var y = 99");
    await k.reset();
    const r = await k.exec("typeof y");
    expect(r.value).toBe("'undefined'");
  });

  it("vm timeout interrupts an infinite loop and the kernel survives", async () => {
    k = new JsKernel(RUNNER, process.cwd());
    const r = await k.exec("while (true) {}", { timeoutMs: 500 });
    expect(r.ok).toBe(false);
    const ok = await k.exec("1 + 1");
    expect(ok.value).toBe("2");
  });
});
