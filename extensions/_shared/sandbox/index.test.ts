import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetForTest, getSandbox } from "./index.js";
import { NoopSandbox } from "./noop.js";
import { WslSandbox } from "./wsl.js";

beforeEach(() => __resetForTest());

describe("getSandbox", () => {
  it("returns WslSandbox when a usable distro + deps are detected", async () => {
    const probe = vi.fn(async () => ({ ok: true as const, distro: "Ubuntu" }));
    const s = await getSandbox({ probe });
    expect(s).toBeInstanceOf(WslSandbox);
    await getSandbox({ probe });
    expect(probe).toHaveBeenCalledTimes(1); // 缓存
  });
  it("returns NoopSandbox when probe fails", async () => {
    const s = await getSandbox({ probe: async () => ({ ok: false as const, reason: "no wsl" }) });
    expect(s).toBeInstanceOf(NoopSandbox);
  });
});
