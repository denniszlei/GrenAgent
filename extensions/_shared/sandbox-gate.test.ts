import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./runtime-config.js", () => ({ getConfig: vi.fn() }));
vi.mock("./approval.js", () => ({ getApprovalPolicy: vi.fn() }));
vi.mock("./sandbox/index.js", () => ({ getSandbox: vi.fn() }));

import { getApprovalPolicy } from "./approval.js";
import { getConfig } from "./runtime-config.js";
import { getSandbox } from "./sandbox/index.js";
import { sandboxOn } from "./sandbox-gate.js";

const avail = (v: boolean) => ({ isAvailable: async () => v });
beforeEach(() => vi.resetAllMocks());

describe("sandboxOn", () => {
  it("false when SANDBOX_ENABLE=off (master kill)", async () => {
    vi.mocked(getConfig).mockReturnValue("off");
    vi.mocked(getApprovalPolicy).mockReturnValue("auto");
    vi.mocked(getSandbox).mockReturnValue(avail(true) as never);
    expect(await sandboxOn()).toBe(false);
  });
  it("false when policy=full", async () => {
    vi.mocked(getConfig).mockReturnValue(undefined);
    vi.mocked(getApprovalPolicy).mockReturnValue("full");
    vi.mocked(getSandbox).mockReturnValue(avail(true) as never);
    expect(await sandboxOn()).toBe(false);
  });
  it("true when not-off, policy!=full, and available", async () => {
    vi.mocked(getConfig).mockReturnValue(undefined);
    vi.mocked(getApprovalPolicy).mockReturnValue("auto");
    vi.mocked(getSandbox).mockReturnValue(avail(true) as never);
    expect(await sandboxOn()).toBe(true);
  });
  it("false when sandbox unavailable", async () => {
    vi.mocked(getConfig).mockReturnValue(undefined);
    vi.mocked(getApprovalPolicy).mockReturnValue("ask");
    vi.mocked(getSandbox).mockReturnValue(avail(false) as never);
    expect(await sandboxOn()).toBe(false);
  });
});
