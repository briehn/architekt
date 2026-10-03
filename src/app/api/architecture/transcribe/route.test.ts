import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../server/openai-architecture-transcription-provider", () => ({ createOpenAIArchitectureTranscriptionProvider: vi.fn() }));

import { POST } from "./route";
import { createOpenAIArchitectureTranscriptionProvider } from "../../../../server/openai-architecture-transcription-provider";
import {
  ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES,
  transcriptionFailure,
  type ArchitectureTranscriptionProviderResult,
} from "../../../../application/architecture-transcription";
import { ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS } from "../../../../server/architecture-transcription-config";

const webm = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0);
const mp4 = Uint8Array.of(0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
const factory = vi.mocked(createOpenAIArchitectureTranscriptionProvider);

function configure(result: ArchitectureTranscriptionProviderResult = { ok: true, output: "  Web client to API  " }) {
  vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
  vi.stubEnv("ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL", "");
  const transcribe = vi.fn().mockResolvedValue(result);
  factory.mockReturnValue({ transcribe });
  return transcribe;
}

function request(audio: Uint8Array = webm, type = "audio/webm", extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/architecture/transcribe", {
    method: "POST", body: Uint8Array.from(audio), headers: { "content-type": type, ...extraHeaders },
  });
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.useRealTimers(); });

describe("POST /api/architecture/transcribe", () => {
  it("returns validated text and reads server configuration lazily", async () => {
    const transcribe = configure();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ transcript: "Web client to API" });
    expect(factory).toHaveBeenCalledExactlyOnceWith({ apiKey: "test-only-placeholder", model: "gpt-transcribe" });
    expect(transcribe).toHaveBeenCalledWith({ audio: webm, mediaType: "audio/webm" }, expect.any(AbortSignal));
  });

  it("supports MP4/AAC and the independent model override", async () => {
    const transcribe = configure();
    vi.stubEnv("ARCHITEKT_OPENAI_MODEL", "architecture-only-model");
    vi.stubEnv("ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL", " another-transcriber ");
    expect((await POST(request(mp4, "audio/mp4; codecs=mp4a.40.2"))).status).toBe(200);
    expect(factory).toHaveBeenCalledWith({ apiKey: "test-only-placeholder", model: "another-transcriber" });
    expect(transcribe.mock.calls[0][0].mediaType).toBe("audio/mp4");
  });

  it.each([
    ["audio/wav", "unsupported-audio", 415],
    ["audio/webm;codecs=vp9", "unsupported-audio", 415],
    ["", "unsupported-audio", 415],
  ] as const)("rejects unsupported Content-Type %j", async (type, failure, status) => {
    configure();
    const response = await POST(request(webm, type));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: transcriptionFailure(failure) });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects empty audio and invalid container signatures", async () => {
    configure();
    for (const audio of [new Uint8Array(), Uint8Array.of(1, 2, 3, 4)]) {
      const response = await POST(request(audio));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: transcriptionFailure("invalid-audio") });
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("accepts exactly 3 MiB without truncation", async () => {
    const transcribe = configure();
    const audio = new Uint8Array(ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES);
    audio.set(webm);
    const response = await POST(request(audio));
    expect(response.status).toBe(200);
    expect(transcribe.mock.calls[0][0].audio.byteLength).toBe(ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES);
  });

  it("rejects declared oversize before reading", async () => {
    configure();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request("http://localhost/api/architecture/transcribe", {
      method: "POST", body, headers: { "content-type": "audio/webm", "content-length": String(ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES + 1) }, duplex: "half",
    } as RequestInit);
    const response = await POST(req);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])("rejects actual streamed oversize with dishonest length %j", async (length) => {
    configure();
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { chunks++; controller.enqueue(new Uint8Array(64 * 1024)); }, cancel,
    });
    const headers = { "content-type": "audio/webm", ...(length ? { "content-length": length } : {}) };
    const req = new Request("http://localhost/api/architecture/transcribe", { method: "POST", body, headers, duplex: "half" } as RequestInit);
    const response = await POST(req);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(chunks).toBeLessThan(60);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects cross-origin browser requests before provider creation", async () => {
    configure();
    const cases: Record<string, string>[] = [{ origin: "https://other.example" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }];
    for (const headers of cases) {
      const response = await POST(request(webm, "audio/webm", headers));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: transcriptionFailure("invalid-request-origin") });
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("fails safely without an API key", async () => {
    configure();
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: transcriptionFailure("configuration-unavailable") });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    ["transcription-timeout", 504], ["transcription-rate-limited", 429],
    ["provider-unavailable", 503], ["transcription-failed", 502],
  ] as const)("maps %s to a safe %i response", async (type, status) => {
    configure({ ok: false, type });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: transcriptionFailure(type) });
  });

  it.each([
    ["  ", "no-usable-transcript", 422],
    [{ text: "private provider output" }, "invalid-transcription", 502],
    ["x".repeat(20_001), "invalid-transcription", 502],
  ] as const)("does not return invalid provider output %#", async (output, type, status) => {
    configure({ ok: true, output });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: transcriptionFailure(type) });
  });

  it("enforces the 15-second body deadline when a stream stalls", async () => {
    vi.useFakeTimers();
    configure();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request("http://localhost/api/architecture/transcribe", {
      method: "POST", body, headers: { "content-type": "audio/webm" }, duplex: "half",
    } as RequestInit);
    const pending = POST(req);
    await vi.advanceTimersByTimeAsync(ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(cancel).toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it("does not return a late success after request cancellation", async () => {
    const transcribe = configure();
    let resolve!: (value: ArchitectureTranscriptionProviderResult) => void;
    transcribe.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const abort = new AbortController();
    const req = new Request("http://localhost/api/architecture/transcribe", {
      method: "POST", body: Uint8Array.from(webm), headers: { "content-type": "audio/webm" }, signal: abort.signal,
    });
    const pending = POST(req);
    await vi.waitFor(() => expect(transcribe).toHaveBeenCalledTimes(1));
    abort.abort();
    const response = await pending;
    expect(response.status).toBe(499);
    resolve({ ok: true, output: "stale transcript" });
  });
});
