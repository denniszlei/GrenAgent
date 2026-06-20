import { describe, expect, it, vi } from "vitest";

// index.ts pulls in the (heavy) sub-agent runner + sandbox gate at import time;
// stub them so we can unit-test the pure capability-floor helper in isolation.
vi.mock("../multi-agent/runner.js", () => ({ spawnPiAgent: vi.fn() }));
vi.mock("../_shared/sandbox-gate.js", () => ({ sandboxAvailable: vi.fn(), sandboxOn: vi.fn() }));

import { restrictedDenyTools } from "./index.js";

describe("restrictedDenyTools (H1 capability floor)", () => {
  it("always denies built-in bash, sandboxed or not (not approval-policy dependent)", () => {
    expect(restrictedDenyTools(true)).toContain("bash");
    expect(restrictedDenyTools(false)).toContain("bash");
  });

  it("always denies host write / debug-exec / github bypass tools", () => {
    for (const sandboxed of [true, false]) {
      const deny = restrictedDenyTools(sandboxed);
      for (const tool of ["ast_edit", "hl_edit", "dap_launch", "dap_evaluate", "github"]) {
        expect(deny).toContain(tool);
      }
    }
  });

  it("denies sandboxable code-exec only when no sandbox is available", () => {
    const sandboxed = restrictedDenyTools(true);
    expect(sandboxed).not.toContain("py_run");
    expect(sandboxed).not.toContain("js_run");
    expect(sandboxed).not.toContain("sandbox_sh");

    const noSandbox = restrictedDenyTools(false);
    expect(noSandbox).toContain("py_run");
    expect(noSandbox).toContain("js_run");
    expect(noSandbox).toContain("sandbox_sh");
  });

  it("returns a de-duplicated list", () => {
    const deny = restrictedDenyTools(false);
    expect(deny.length).toBe(new Set(deny).size);
  });
});
