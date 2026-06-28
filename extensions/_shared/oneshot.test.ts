import { describe, expect, it } from "vitest";
import { formatNonStream, parseOneshotRequest } from "./oneshot.js";

describe("parseOneshotRequest", () => {
  it("accepts a valid request and defaults stream=false", () => {
    expect(parseOneshotRequest('{"provider":"anthropic","modelId":"claude","user":"hi"}')).toEqual({
      ok: true,
      req: { provider: "anthropic", modelId: "claude", user: "hi", system: undefined, stream: false },
    });
  });

  it("carries system + stream", () => {
    const r = parseOneshotRequest('{"provider":"p","modelId":"m","user":"u","system":"s","stream":true}');
    expect(r).toEqual({ ok: true, req: { provider: "p", modelId: "m", user: "u", system: "s", stream: true } });
  });

  it("rejects missing user", () => {
    expect(parseOneshotRequest('{"provider":"anthropic","modelId":"claude"}').ok).toBe(false);
  });

  it("rejects invalid json", () => {
    expect(parseOneshotRequest("not json").ok).toBe(false);
  });
});

describe("formatNonStream", () => {
  it("extracts text + usage", () => {
    expect(
      formatNonStream({ content: [{ type: "text", text: "hello" }], usage: { input: 10, output: 3 } }),
    ).toEqual({ ok: true, content: "hello", usage: { input: 10, output: 3 } });
  });

  it("joins multiple text blocks, ignores non-text", () => {
    const out = formatNonStream({ content: [{ type: "text", text: "a" }, { type: "thinking" }, { type: "text", text: "b" }] });
    expect(out).toEqual({ ok: true, content: "ab", usage: undefined });
  });

  it("errors on empty content", () => {
    expect(formatNonStream({ content: [] }).ok).toBe(false);
  });
});
