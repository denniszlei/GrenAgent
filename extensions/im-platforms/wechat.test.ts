import { describe, expect, it } from "vitest";
import { buildTextItems, isOk, itemListToText } from "./wechat.js";

describe("itemListToText", () => {
  it("joins text items and renders media placeholders", () => {
    const text = itemListToText([
      { type: 1, text_item: { text: "hello" } },
      { type: 2 },
      { type: 1, text_item: { text: "world" } },
    ]);
    expect(text).toBe("hello\n[图片]\nworld");
  });

  it("prefers voice recognition text, falls back to placeholder", () => {
    expect(itemListToText([{ type: 3, voice_item: { text: "你好" } }])).toBe("你好");
    expect(itemListToText([{ type: 3 }])).toBe("[语音]");
  });

  it("renders file/video placeholders and ignores unknown items", () => {
    expect(itemListToText([{ type: 4 }, { type: 5 }, { type: 99 }])).toBe("[文件]\n[视频]");
  });

  it("returns empty string for non-array input", () => {
    expect(itemListToText(undefined)).toBe("");
    expect(itemListToText(null)).toBe("");
  });
});

describe("buildTextItems", () => {
  it("wraps text into a type-1 item", () => {
    expect(buildTextItems("hi")).toEqual([{ type: 1, text_item: { text: "hi" } }]);
  });
});

describe("isOk", () => {
  it("is true only when ret and errcode are both 0", () => {
    expect(isOk({ ret: 0, errcode: 0 })).toBe(true);
    expect(isOk({})).toBe(true);
    expect(isOk({ ret: 1 })).toBe(false);
    expect(isOk({ errcode: -1 })).toBe(false);
  });
});
