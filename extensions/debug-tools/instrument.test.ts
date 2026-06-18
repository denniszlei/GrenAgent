import { describe, expect, it } from "vitest";
import { instrumentGuide, instrumentSnippet, normalizeLang, SUPPORTED_LANGS } from "./instrument.js";

describe("normalizeLang", () => {
  it("maps common aliases", () => {
    expect(normalizeLang("javascript")).toBe("js");
    expect(normalizeLang("typescript")).toBe("ts");
    expect(normalizeLang("py")).toBe("python");
    expect(normalizeLang("bash")).toBe("shell");
    expect(normalizeLang("golang")).toBe("go");
    expect(normalizeLang("rs")).toBe("rust");
    expect(normalizeLang("rb")).toBe("ruby");
  });
  it("falls back to js for unknown/empty", () => {
    expect(normalizeLang(undefined)).toBe("js");
    expect(normalizeLang("cobol")).toBe("js");
  });
});

describe("instrumentSnippet", () => {
  const endpoint = "http://127.0.0.1:54321/log";

  it("embeds the endpoint for every supported language", () => {
    for (const lang of SUPPORTED_LANGS) {
      const snippet = instrumentSnippet(lang, endpoint);
      expect(snippet).toContain(endpoint);
      expect(snippet).toContain("TAG");
      // 每个片段都带可搜索的清理标记。
      expect(snippet.toLowerCase()).toContain("[debug]");
    }
  });

  it("emits language-appropriate calls", () => {
    expect(instrumentSnippet("js", endpoint)).toContain("fetch(");
    expect(instrumentSnippet("python", endpoint)).toContain("urllib");
    expect(instrumentSnippet("shell", endpoint)).toContain("curl");
    expect(instrumentSnippet("go", endpoint)).toContain("http.Post");
  });

  it("json-encodes the endpoint to stay injection-safe", () => {
    const snippet = instrumentSnippet("js", endpoint);
    expect(snippet).toContain(JSON.stringify(endpoint));
  });
});

describe("instrumentGuide", () => {
  it("references endpoint, log file and the reproduce/read loop", () => {
    const guide = instrumentGuide("http://127.0.0.1:1/log", "/proj/.pi/debug/debug.log");
    expect(guide).toContain("http://127.0.0.1:1/log");
    expect(guide).toContain("/proj/.pi/debug/debug.log");
    expect(guide).toContain("debug_log");
    expect(guide).toContain("127.0.0.1");
  });
});
