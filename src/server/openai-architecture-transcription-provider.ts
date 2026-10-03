import "server-only";

import OpenAI, { toFile, type ClientOptions } from "openai";
import type { Transcription } from "openai/resources/audio/transcriptions";
import type {
  ArchitectureTranscriptionProvider,
  ArchitectureTranscriptionProviderResult,
} from "../application/architecture-transcription";
import {
  ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
  type ArchitectureTranscriptionConfig,
} from "./architecture-transcription-config";

export type ArchitectureAudioClient = {
  audio: {
    transcriptions: {
      create(request: { file: File; model: string; response_format: "json"; languages: string[] },
        options: { signal: AbortSignal }): Promise<Pick<Transcription, "text">>;
    };
  };
};

type ProviderFailure = Extract<ArchitectureTranscriptionProviderResult, { ok: false }>["type"];

function failed(type: ProviderFailure): ArchitectureTranscriptionProviderResult {
  return { ok: false, type };
}

function normalizeProviderError(error: unknown): ArchitectureTranscriptionProviderResult | undefined {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return failed("transcription-timeout");
  if (error instanceof OpenAI.APIConnectionError) return failed("provider-unavailable");
  if (error instanceof OpenAI.APIError) {
    if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(error.code ?? "")) {
      return failed("configuration-unavailable");
    }
    if (error.status === 400) return failed("invalid-audio");
    if ([401, 403, 404].includes(error.status ?? -1)) return failed("configuration-unavailable");
    if (error.status === 429) return failed("transcription-rate-limited");
    if (error.status === 408 || error.status === 504) return failed("transcription-timeout");
    if (error.status !== undefined && error.status >= 500) return failed("provider-unavailable");
    return failed("transcription-failed");
  }
}

export function createOpenAIArchitectureTranscriptionProvider(
  config: ArchitectureTranscriptionConfig,
  createClient: (options: ClientOptions) => ArchitectureAudioClient = (options) => new OpenAI(options),
): ArchitectureTranscriptionProvider {
  const client = createClient({
    apiKey: config.apiKey,
    baseURL: "https://api.openai.com/v1",
    timeout: ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
    logLevel: "off",
  });

  return {
    async transcribe(input, signal) {
      if (signal.aborted) return failed("transcription-canceled");
      const deadline = new AbortController();
      const onAbort = () => deadline.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => deadline.abort(), ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS);
      const interrupted = new Promise<never>((_resolve, reject) => {
        deadline.signal.addEventListener("abort", () => reject(new Error("Transcription interrupted")), { once: true });
      });
      try {
        if (signal.aborted) return failed("transcription-canceled");
        const transcription = async () => {
          const extension = input.mediaType === "audio/webm" ? "webm" : "mp4";
          const file = await toFile(input.audio, `architecture-recording.${extension}`, { type: input.mediaType });
          if (deadline.signal.aborted) throw new Error("Transcription interrupted");
          return client.audio.transcriptions.create({
            model: config.model,
            file,
            response_format: "json",
            languages: ["en"],
          }, { signal: deadline.signal });
        };
        const response = await Promise.race([transcription(), interrupted]);
        if (signal.aborted) return failed("transcription-canceled");
        if (deadline.signal.aborted) return failed("transcription-timeout");
        return { ok: true, output: response.text };
      } catch (error) {
        if (signal.aborted) return failed("transcription-canceled");
        if (deadline.signal.aborted) return failed("transcription-timeout");
        const normalized = normalizeProviderError(error);
        if (normalized) return normalized;
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
