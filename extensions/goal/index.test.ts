import { describe, expect, it } from "vitest";
import factory from "./index.js";

describe("goal extension factory", () => {
  it("registers /goal command and session_start/agent_end hooks", () => {
    const commands: string[] = [];
    const events: string[] = [];
    factory({
      registerCommand: (n: string) => commands.push(n),
      on: (e: string) => events.push(e),
      appendEntry: () => {},
      sendMessage: () => {},
    } as never);
    expect(commands).toContain("goal");
    expect(events).toEqual(expect.arrayContaining(["session_start", "agent_end"]));
  });
});
