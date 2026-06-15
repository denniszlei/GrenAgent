// Text-to-speech via an OpenAI-compatible /audio/speech endpoint.
// Returns raw audio bytes; requires TTS_API_KEY or OPENAI_API_KEY.

import { getConfig } from "../_shared/runtime-config.js";

export interface TtsConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  format: string;
}

export function resolveTtsConfig(): TtsConfig {
  const apiKey = getConfig("TTS_API_KEY") ?? getConfig("OPENAI_API_KEY") ?? "";
  const baseUrl = (getConfig("TTS_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    enabled: apiKey.length > 0,
    baseUrl,
    apiKey,
    model: getConfig("TTS_MODEL") ?? "gpt-4o-mini-tts",
    voice: getConfig("TTS_VOICE") ?? "alloy",
    format: getConfig("TTS_FORMAT") ?? "mp3",
  };
}

export async function synthesizeSpeech(
  text: string,
  config: TtsConfig,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!config.enabled) throw new Error("TTS disabled: set TTS_API_KEY or OPENAI_API_KEY");

  const res = await fetch(`${config.baseUrl}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: text, voice: config.voice, response_format: config.format }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`TTS API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
