import { describe, expect, it } from "vitest";
import { NoopSandbox } from "./noop.js";

describe("NoopSandbox", () => {
  it("is never available and throws on exec", async () => {
    const s = new NoopSandbox();
    expect(await s.isAvailable()).toBe(false);
    await expect(s.exec("echo hi", { cwd: "D:\\x" })).rejects.toThrow(/不可用/);
  });
});
