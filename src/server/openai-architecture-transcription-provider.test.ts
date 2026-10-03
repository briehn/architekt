import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import OpenAI from "openai";
import { transcriptionFailure } from "../application/architecture-transcription";
import { transcribeArchitectureAudio } from "../application/architecture-transcription";
import {
  ARCHITECTURE_TRANSCRIPTION_DEFAULT_MODEL,
  ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS,
  loadArchitectureTranscriptionConfig,
} from "./architecture-transcription-config";
import { createOpenAIArchitectureTranscriptionProvider, type ArchitectureAudioClient } from "./openai-architecture-transcription-provider";

const input = { audio: Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0), mediaType: "audio/webm" as const };

function setup(output: unknown = { text: "  API to database  " }) {
  const create = vi.fn<ArchitectureAudioClient["audio"]["transcriptions"]["create"]>().mockResolvedValue(output as { text: string });
  const factory = vi.fn(() => ({ audio: { transcriptions: { create } } }));
  const adapter = createOpenAIArchitectureTranscriptionProvider({ apiKey: "test-only-placeholder", model: "gpt-transcribe" }, factory);
  return { create, factory, adapter };
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("OpenAI transcription adapter", () => {
  it("reads a separate default/override model from server-only configuration", () => {
    vi.stubEnv("OPENAI_API_KEY", " test-only-placeholder ");
    vi.stubEnv("ARCHITEKT_OPENAI_MODEL", "architecture-only-model");
    vi.stubEnv("ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL", "");
    expect(loadArchitectureTranscriptionConfig()).toEqual({ apiKey: "test-only-placeholder", model: ARCHITECTURE_TRANSCRIPTION_DEFAULT_MODEL });
    vi.stubEnv("ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL", " custom-transcriber ");
    expect(loadArchitectureTranscriptionConfig()?.model).toBe("custom-transcriber");
    vi.stubEnv("OPENAI_API_KEY", " ");
    expect(loadArchitectureTranscriptionConfig()).toBeUndefined();
  });

  it("uses a named in-memory upload with English and no hints, retries, or logging", async () => {
    const { create, factory, adapter } = setup();
    expect(await transcribeArchitectureAudio(input, adapter, new AbortController().signal)).toEqual({ ok: true, transcript: "API to database" });
    expect(factory).toHaveBeenCalledExactlyOnceWith({
      apiKey: "test-only-placeholder", baseURL: "https://api.openai.com/v1",
      timeout: ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS, maxRetries: 0, logLevel: "off",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0];
    expect(body).toEqual({ model: "gpt-transcribe", file: expect.any(File), response_format: "json", languages: ["en"] });
    expect(body.file.name).toBe("architecture-recording.webm");
    expect(body.file.type).toBe("audio/webm");
    expect(new Uint8Array(await body.file.arrayBuffer())).toEqual(input.audio);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("keywords");
  });

  it("names MP4 uploads correctly", async () => {
    const { create, adapter } = setup();
    const audio = Uint8Array.of(0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
    expect((await adapter.transcribe({ audio, mediaType: "audio/mp4" }, new AbortController().signal)).ok).toBe(true);
    expect(create.mock.calls[0][0].file.name).toBe("architecture-recording.mp4");
    expect(create.mock.calls[0][0].file.type).toBe("audio/mp4");
  });

  it("propagates cancellation and prevents a late success", async () => {
    const { create, adapter } = setup();
    let resolve!: (value: { text: string }) => void;
    create.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const controller = new AbortController();
    const pending = adapter.transcribe(input, controller.signal);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const providerSignal = create.mock.calls[0][1].signal;
    controller.abort();
    expect(providerSignal.aborted).toBe(true);
    resolve({ text: "stale" });
    expect(await pending).toEqual({ ok: false, type: "transcription-canceled" });
  });

  it("enforces a 40-second deadline even if the SDK promise ignores abort", async () => {
    vi.useFakeTimers();
    const { create, adapter } = setup();
    create.mockImplementation(() => new Promise(() => {}));
    const pending = adapter.transcribe(input, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, type: "transcription-timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [new OpenAI.APIConnectionTimeoutError(), "transcription-timeout"],
    [new OpenAI.APIConnectionError({ message: "private" }), "provider-unavailable"],
    [new OpenAI.APIError(429, {}, "private", new Headers()), "transcription-rate-limited"],
    [new OpenAI.APIError(429, { code: "insufficient_quota" }, "private", new Headers()), "configuration-unavailable"],
    [new OpenAI.APIError(401, {}, "private", new Headers()), "configuration-unavailable"],
    [new OpenAI.APIError(503, {}, "private", new Headers()), "provider-unavailable"],
    [new OpenAI.APIError(400, {}, "private", new Headers()), "invalid-audio"],
  ] as const)("maps known SDK error %# without exposing it", async (error, type) => {
    const { create, adapter } = setup();
    create.mockRejectedValue(error);
    expect(await transcribeArchitectureAudio(input, adapter, new AbortController().signal))
      .toEqual({ ok: false, error: transcriptionFailure(type) });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not flatten an unexpected coding error", async () => {
    const { create, adapter } = setup();
    const bug = new Error("unexpected implementation failure");
    create.mockRejectedValue(bug);
    await expect(adapter.transcribe(input, new AbortController().signal)).rejects.toBe(bug);
  });
});
