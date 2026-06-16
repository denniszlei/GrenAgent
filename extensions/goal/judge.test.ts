import { describe, expect, it } from "vitest";
import { type AskFn } from "./llm.js";
import { flattenTranscript, judge } from "./judge.js";

describe("flattenTranscript", () => {
  it("joins string and block content as role: text", () => {
    expect(
      flattenTranscript([
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "text", text: "yo" }, { type: "thinking", text: "x" }] },
      ]),
    ).toBe("user: hi\nassistant: yo");
  });
});

describe("judge", () => {
  it("ok verdict → ok:true", async () => {
    const ask: AskFn = async () => '{"verdict":"ok","reason":"done"}';
    expect(await judge(ask, [], "c")).toEqual({ ok: true, reason: "done" });
  });
  it("fenced not_ok verdict → ok:false", async () => {
    const ask: AskFn = async () => '```json\n{"verdict":"not_ok","reason":"tests missing"}\n```';
    expect(await judge(ask, [], "c")).toEqual({ ok: false, reason: "tests missing" });
  });
  it("text 'not ok' fallback → ok:false", async () => {
    const ask: AskFn = async () => "Honestly this is not ok yet.";
    expect((await judge(ask, [], "c")).ok).toBe(false);
  });
  it("unparseable → fail-open ok:true", async () => {
    const ask: AskFn = async () => "hmm maybe?";
    expect((await judge(ask, [], "c")).ok).toBe(true);
  });
  it("ask throws → fail-open ok:true", async () => {
    const ask: AskFn = async () => {
      throw new Error("no model");
    };
    expect((await judge(ask, [], "c")).ok).toBe(true);
  });
});
