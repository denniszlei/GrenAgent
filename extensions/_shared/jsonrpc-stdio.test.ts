import { describe, expect, it } from "vitest";
import { FrameDecoder, encodeFrame } from "./jsonrpc-stdio.js";

describe("encodeFrame", () => {
  it("prefixes Content-Length and the JSON body", () => {
    expect(encodeFrame({ a: 1 }).toString("utf8")).toBe('Content-Length: 7\r\n\r\n{"a":1}');
  });
});

describe("FrameDecoder", () => {
  it("decodes a single frame", () => {
    const d = new FrameDecoder();
    expect(d.push(encodeFrame({ x: 1 }))).toEqual([{ x: 1 }]);
  });
  it("buffers split chunks across the header/body boundary", () => {
    const d = new FrameDecoder();
    const buf = encodeFrame({ hello: "world" });
    const mid = Math.floor(buf.length / 2);
    expect(d.push(buf.subarray(0, mid))).toEqual([]);
    expect(d.push(buf.subarray(mid))).toEqual([{ hello: "world" }]);
  });
  it("decodes multiple frames in one chunk", () => {
    const d = new FrameDecoder();
    const two = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: 2 })]);
    expect(d.push(two)).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
