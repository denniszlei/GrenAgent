import { describe, expect, it } from "vitest";
import approval from "./index.js";

describe("approval extension", () => {
  it("registers the approval command", () => {
    const cmds: string[] = [];
    const pi = {
      registerCommand: (n: string) => cmds.push(n),
      on: () => {},
      appendEntry: () => {},
    };
    approval(pi as unknown as Parameters<typeof approval>[0]);
    expect(cmds).toEqual(["approval"]);
  });
});
