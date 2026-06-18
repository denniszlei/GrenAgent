// Text-to-speech via an OpenAI-compatible /audio/speech endpoint.
// Returns raw audio bytes; requires TTS_API_KEY or OPENAI_API_KEY.
//
// 方言：多数供应商用 OpenAI 的 POST {base}/audio/speech；但小米 MiMo 没有该端点，
// TTS 跑在 /chat/completions 上（文本放 assistant 消息、audio 字段给 voice/format、
// 鉴权用 api-key、返回 choices[0].message.audio.data 的 base64）。按模型名/baseUrl 自动识别。

import { getConfig } from "../_shared/runtime-config.js";
import {
  capabilityError,
  capabilityFetch,
  resolveCapabilityEndpoint,
  type RegistryLike,
} from "../_shared/provider-endpoint.js";

export type TtsDialect = "openai" | "mimo";

export interface TtsConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  format: string;
  dialect: TtsDialect;
}

/**
 * 识别 TTS 方言：MiMo（小米）走 chat/completions 而非 /audio/speech。
 * 按 baseUrl 主机（xiaomimimo.com）或模型名（mimo…tts，含 v2/v2.5 及 voicedesign/voiceclone）判定。
 */
export function detectTtsDialect(baseUrl: string, model: string): TtsDialect {
  const url = baseUrl.toLowerCase();
  const m = model.toLowerCase();
  if (url.includes("xiaomimimo.com") || /mimo.*tts/.test(m)) return "mimo";
  return "openai";
}

export async function resolveTtsConfig(registry: RegistryLike): Promise<TtsConfig> {
  const ep = await resolveCapabilityEndpoint(registry, getConfig("TTS_PROVIDER"), getConfig("TTS_MODEL"), "gpt-4o-mini-tts");
  const dialect = detectTtsDialect(ep.baseUrl, ep.model);
  const rawVoice = getConfig("TTS_VOICE");
  const rawFormat = getConfig("TTS_FORMAT");
  // MiMo 与 OpenAI 默认音色/格式不同：MiMo 没有 alloy 音色、且不支持 mp3（仅 wav/pcm16）。
  let voice = rawVoice ?? (dialect === "mimo" ? "mimo_default" : "alloy");
  if (dialect === "mimo" && voice.toLowerCase() === "alloy") voice = "mimo_default";
  const format =
    dialect === "mimo"
      ? rawFormat && /^(wav|pcm16)$/i.test(rawFormat)
        ? rawFormat
        : "wav"
      : rawFormat ?? "mp3";
  return { ...ep, voice, format, dialect };
}

export async function synthesizeSpeech(
  text: string,
  config: TtsConfig,
  signal?: AbortSignal,
  instruct?: string,
): Promise<Uint8Array> {
  if (!config.enabled) throw new Error("TTS disabled: 请在设置-供应商选择 TTS 供应商并配置其 API Key");
  if (config.dialect === "mimo") return synthesizeMimo(text, config, signal, instruct);

  const body: Record<string, unknown> = {
    model: config.model,
    input: text,
    voice: config.voice,
    response_format: config.format,
  };
  // gpt-4o-mini-tts 支持用自然语言 instructions 控制语气/情绪/场景（tts-1 / tts-1-hd 不支持，忽略即可）。
  if (instruct) body.instructions = instruct;

  const res = await capabilityFetch(config.baseUrl, "audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw await capabilityError("TTS API", res);

  return new Uint8Array(await res.arrayBuffer());
}

/**
 * MiMo（小米）TTS：POST {base}/chat/completions，目标文本放在 assistant 消息里，
 * audio 字段给 voice/format，鉴权用 api-key（同时附 Bearer 以兼容前置网关），
 * 返回的音频是 choices[0].message.audio.data（base64，已是请求格式的完整文件）。
 */
async function synthesizeMimo(
  text: string,
  config: TtsConfig,
  signal?: AbortSignal,
  instruct?: string,
): Promise<Uint8Array> {
  // voice design：user 消息给「语气/情绪/场景/音色」自然语言指令（instruct），assistant 消息给要朗读的文本。
  // 无 instruct 时退回纯 assistant 文本（用预设 voice）。
  const messages = instruct
    ? [
        { role: "user", content: instruct },
        { role: "assistant", content: text },
      ]
    : [{ role: "assistant", content: text }];
  // voicedesign 模型的音色完全由 instruct 设计，不接受预设 voice（对齐官方示例：audio 仅含 format）。
  const audio: Record<string, unknown> = { format: config.format };
  if (!/voicedesign/i.test(config.model)) audio.voice = config.voice;

  const res = await capabilityFetch(config.baseUrl, "chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      audio,
    }),
    signal,
  });

  if (!res.ok) throw await capabilityError("TTS API", res);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { audio?: { data?: string } } }>;
  };
  const b64 = json.choices?.[0]?.message?.audio?.data;
  if (!b64) {
    throw new Error(
      "MiMo TTS 返回无 audio 数据：请确认模型为 mimo-v2.5-tts、账号已开通 TTS，且 voice/format 合法（format 仅 wav/pcm16）。",
    );
  }
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
