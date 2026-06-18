import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/runtime-config.js", () => ({
  getConfig: (k: string) =>
    ({ TTS_PROVIDER: "openai", TTS_MODEL: "tts-1", TTS_VOICE: "nova", TTS_FORMAT: "wav" } as Record<string, string>)[k],
}));

vi.mock("../_shared/provider-endpoint.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/provider-endpoint.js")>();
  return { ...actual, capabilityFetch: vi.fn() };
});

import { detectTtsDialect, resolveTtsConfig, synthesizeSpeech, type TtsConfig } from "./tts.js";
import { capabilityFetch } from "../_shared/provider-endpoint.js";

const mockFetch = vi.mocked(capabilityFetch);

function mockRes(opts: { json?: unknown; buffer?: ArrayBuffer }): Response {
  return {
    ok: true,
    json: async () => opts.json,
    arrayBuffer: async () => opts.buffer ?? new ArrayBuffer(0),
  } as unknown as Response;
}

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse((mockFetch.mock.calls[call]?.[2] as { body: string }).body);
}

const audioJson = mockRes({
  json: { choices: [{ message: { audio: { data: Buffer.from("a").toString("base64") } } }] },
});

const registry = (key: string | undefined) => ({
  getAll: () => [{ provider: "openai", baseUrl: "https://api.openai.com/v1" }] as never,
  getApiKeyForProvider: async () => key,
});

describe("resolveTtsConfig", () => {
  it("resolves endpoint + behavior fields", async () => {
    const c = await resolveTtsConfig(registry("sk-x") as never);
    expect(c).toMatchObject({
      enabled: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-x",
      model: "tts-1",
      voice: "nova",
      format: "wav",
      dialect: "openai",
    });
  });

  it("disabled when no key", async () => {
    const c = await resolveTtsConfig(registry(undefined) as never);
    expect(c.enabled).toBe(false);
  });
});

describe("detectTtsDialect", () => {
  it("detects MiMo by model id (v2 / v2.5 / voice variants)", () => {
    expect(detectTtsDialect("https://proxy.example.com/v1", "mimo-v2.5-tts")).toBe("mimo");
    expect(detectTtsDialect("https://proxy.example.com/v1", "mimo-v2-tts")).toBe("mimo");
    expect(detectTtsDialect("https://proxy.example.com/v1", "mimo-v2.5-tts-voiceclone")).toBe("mimo");
  });

  it("detects MiMo by base url host", () => {
    expect(detectTtsDialect("https://api.xiaomimimo.com/v1", "any-model")).toBe("mimo");
  });

  it("defaults to openai for standard providers", () => {
    expect(detectTtsDialect("https://api.openai.com/v1", "tts-1")).toBe("openai");
    expect(detectTtsDialect("https://api.deepseek.com", "gpt-4o-mini-tts")).toBe("openai");
  });
});

describe("synthesizeSpeech instruct", () => {
  const mimo: TtsConfig = {
    enabled: true,
    baseUrl: "https://api.xiaomimimo.com/v1",
    apiKey: "k",
    model: "mimo-v2.5-tts",
    voice: "mimo_default",
    format: "wav",
    dialect: "mimo",
  };

  beforeEach(() => mockFetch.mockReset());

  it("MiMo: instruct becomes a user message before the assistant text", async () => {
    mockFetch.mockResolvedValue(audioJson);
    await synthesizeSpeech("hello", mimo, undefined, "excited and upbeat");
    const body = sentBody();
    expect(body.messages).toEqual([
      { role: "user", content: "excited and upbeat" },
      { role: "assistant", content: "hello" },
    ]);
    expect(body.audio).toEqual({ format: "wav", voice: "mimo_default" });
  });

  it("MiMo: no instruct keeps the assistant-only message with voice", async () => {
    mockFetch.mockResolvedValue(audioJson);
    await synthesizeSpeech("hello", mimo);
    expect(sentBody().messages).toEqual([{ role: "assistant", content: "hello" }]);
  });

  it("MiMo voicedesign: omits preset voice (designed by instruct)", async () => {
    mockFetch.mockResolvedValue(audioJson);
    await synthesizeSpeech("hi", { ...mimo, model: "mimo-v2.5-tts-voicedesign" }, undefined, "young male tone");
    const body = sentBody();
    expect(body.audio).toEqual({ format: "wav" });
    expect((body.messages as unknown[])[0]).toEqual({ role: "user", content: "young male tone" });
  });

  it("OpenAI: instruct maps to the instructions field", async () => {
    mockFetch.mockResolvedValue(mockRes({ buffer: new ArrayBuffer(4) }));
    await synthesizeSpeech(
      "hi",
      { ...mimo, baseUrl: "https://api.openai.com/v1", dialect: "openai", model: "gpt-4o-mini-tts", voice: "nova", format: "mp3" },
      undefined,
      "calm narrator",
    );
    const body = sentBody();
    expect(body.instructions).toBe("calm narrator");
    expect(body.input).toBe("hi");
    expect(body.messages).toBeUndefined();
  });

  it("OpenAI: no instruct omits the instructions field", async () => {
    mockFetch.mockResolvedValue(mockRes({ buffer: new ArrayBuffer(4) }));
    await synthesizeSpeech("hi", { ...mimo, dialect: "openai", model: "gpt-4o-mini-tts" });
    expect(sentBody().instructions).toBeUndefined();
  });
});
