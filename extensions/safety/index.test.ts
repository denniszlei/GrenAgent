import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/approval.js", () => ({ getApprovalPolicy: vi.fn() }));
vi.mock("../_shared/sandbox-gate.js", () => ({ sandboxOn: vi.fn() }));
vi.mock("../_shared/runtime-config.js", () => ({ getConfig: vi.fn() }));

import { getApprovalPolicy } from "../_shared/approval.js";
import { getConfig } from "../_shared/runtime-config.js";
import { sandboxOn } from "../_shared/sandbox-gate.js";
import safety from "./index.js";

type ToolCall = (event: unknown, ctx: unknown) => Promise<{ block?: boolean; reason?: string } | undefined>;

function setup(): ToolCall {
  let handler: ToolCall | undefined;
  const pi = { on: (ev: string, h: ToolCall) => { if (ev === "tool_call") handler = h; } };
  safety(pi as unknown as Parameters<typeof safety>[0]);
  return (event, ctx) => handler!(event, ctx);
}

const cwd = process.platform === "win32" ? "D:\\proj" : "/proj";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sandboxOn).mockResolvedValue(false);
  vi.mocked(getConfig).mockReturnValue(undefined);
});

describe("safety approval gating", () => {
  it("full policy bypasses everything (even dangerous bash)", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("full");
    const run = setup();
    const r = await run({ toolName: "bash", input: { command: "rm -rf /tmp/x" } }, { hasUI: true, cwd, ui: {} });
    expect(r).toBeUndefined();
  });

  it("ask: blocks out-of-cwd write when user declines", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("ask");
    const ui = { select: vi.fn().mockResolvedValue("拒绝") };
    const r = await setup()({ toolName: "write", input: { path: "../escape.txt" } }, { hasUI: true, cwd, ui });
    expect(ui.select).toHaveBeenCalled();
    expect(r?.block).toBe(true);
  });

  it("ask: allows in-cwd write without prompting", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("ask");
    const ui = { select: vi.fn() };
    const r = await setup()({ toolName: "write", input: { path: "src/a.ts" } }, { hasUI: true, cwd, ui });
    expect(ui.select).not.toHaveBeenCalled();
    expect(r).toBeUndefined();
  });

  it("ask: blocks network tool when user declines", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("ask");
    const ui = { select: vi.fn().mockResolvedValue("拒绝") };
    const r = await setup()({ toolName: "web_fetch", input: { url: "http://x" } }, { hasUI: true, cwd, ui });
    expect(r?.block).toBe(true);
  });

  it("auto: no extra confirm for out-of-cwd write", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("auto");
    const ui = { select: vi.fn() };
    const r = await setup()({ toolName: "write", input: { path: "../escape.txt" } }, { hasUI: true, cwd, ui });
    expect(ui.select).not.toHaveBeenCalled();
    expect(r).toBeUndefined();
  });

  it("blocks built-in bash when sandbox is on (steer to sandbox_sh)", async () => {
    vi.mocked(getApprovalPolicy).mockReturnValue("auto");
    vi.mocked(sandboxOn).mockResolvedValue(true);
    const r = await setup()({ toolName: "bash", input: { command: "ls" } }, { hasUI: true, cwd, ui: {} });
    expect(r?.block).toBe(true);
    expect(r?.reason).toContain("sandbox_sh");
  });
});
