import { afterEach, describe, expect, it, vi } from "vitest";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { transcriptionFailure, type ArchitectureTranscriptionResult } from "../application/architecture-transcription";
import { ArchitectureGenerationReviewController } from "./architecture-generation-review";
import { ArchitectureVoiceController, requestArchitectureTranscription, type ArchitectureTranscriptionRequest, type ArchitectureVoiceState } from "./architecture-voice-controller";
import type { ArchitectureBrowserRecorder, BrowserRecorderStartResult, BrowserRecordingSession } from "./browser-architecture-recorder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const permission = deferred<BrowserRecorderStartResult>();
  const recording = deferred<Blob>();
  const cancel = vi.fn();
  const session: BrowserRecordingSession = { stop: () => recording.promise, cancel };
  const recorder: ArchitectureBrowserRecorder = { supported: () => true, start: vi.fn(() => permission.promise) };
  const response = deferred<ArchitectureTranscriptionResult>();
  const request: ArchitectureTranscriptionRequest = vi.fn(() => response.promise);
  let state: ArchitectureVoiceState = { status: "idle" };
  let prompt = "Existing description";
  const controller = new ArchitectureVoiceController((next) => { state = next; }, (next) => { prompt = next; }, recorder, request);
  return { controller, permission, recording, response, recorder, request, session, cancel, get state() { return state; }, get prompt() { return prompt; } };
}

async function beginRecording(h: ReturnType<typeof harness>) {
  const started = h.controller.start();
  h.permission.resolve({ ok: true, session: h.session });
  await started;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("architecture voice controller", () => {
  it("converges on the existing generation controller only after a reviewed transcript", async () => {
    const h = harness();
    const generation = new ArchitectureGenerationReviewController(() => {}, async () => minimalProposal());
    const voice = new ArchitectureVoiceController(() => {}, (text) => generation.setPrompt(text), h.recorder, h.request);
    const started = voice.start();
    h.permission.resolve({ ok: true, session: h.session });
    await started;
    const stopped = voice.stop();
    h.recording.resolve(new Blob(["audio"], { type: "audio/webm" }));
    await Promise.resolve();
    h.response.resolve({ ok: true, transcript: "A chat system" });
    await stopped;
    expect(generation.getState()).toEqual({ status: "idle", prompt: "A chat system" });
    expect(voice.getState()).toEqual({ status: "transcript-ready" });
    voice.markGenerated();
    await generation.generate();
    expect(generation.getState().status).toBe("review");
    voice.dispose();
    generation.dispose();
  });

  it("preserves existing text through permission failure and cancellation", async () => {
    const denied = harness();
    const start = denied.controller.start();
    denied.permission.resolve({ ok: false, type: "permission-denied" });
    await start;
    expect(denied.state.status).toBe("error");
    expect(denied.prompt).toBe("Existing description");
    denied.controller.dispose();

    const pending = harness();
    const late = pending.controller.start();
    pending.controller.cancel();
    pending.permission.resolve({ ok: true, session: pending.session });
    await late;
    expect(pending.cancel).toHaveBeenCalledOnce();
    expect(pending.state.status).toBe("idle");
    expect(pending.prompt).toBe("Existing description");
    pending.controller.dispose();
  });

  it("keeps retryable audio and retries without microphone access", async () => {
    const h = harness();
    await beginRecording(h);
    const stop = h.controller.stop();
    h.recording.resolve(new Blob(["audio"], { type: "audio/webm" }));
    await Promise.resolve();
    h.response.resolve({ ok: false, error: transcriptionFailure("provider-unavailable") });
    await stop;
    expect(h.state).toMatchObject({ status: "error", retryableAudio: true });
    const retry = h.controller.retry();
    expect(h.recorder.start).toHaveBeenCalledOnce();
    expect(h.request).toHaveBeenCalledTimes(2);
    // The mock request resolves to the same retryable result; a real retry is a new HTTP request.
    await retry;
    h.controller.cancel();
    expect(h.state.status).toBe("idle");
    h.controller.dispose();
  });

  it("cancels recording on page hide and never requests transcription", async () => {
    const h = harness();
    await beginRecording(h);
    h.controller.onPageHidden();
    expect(h.cancel).toHaveBeenCalledOnce();
    expect(h.state).toMatchObject({ status: "error", retryableAudio: false });
    expect(h.request).not.toHaveBeenCalled();
    h.controller.dispose();
  });

  it("rejects an oversized completed clip without upload", async () => {
    const h = harness();
    await beginRecording(h);
    const stop = h.controller.stop();
    h.recording.resolve(new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: "audio/webm" }));
    await stop;
    expect(h.state.status).toBe("error");
    expect(h.request).not.toHaveBeenCalled();
    expect(h.prompt).toBe("Existing description");
    h.controller.dispose();
  });

  it("invalidates a late transcription when reset or another recording starts", async () => {
    const h = harness();
    await beginRecording(h);
    const stop = h.controller.stop();
    h.recording.resolve(new Blob(["audio"], { type: "audio/webm" }));
    await Promise.resolve();
    h.controller.reset();
    h.response.resolve({ ok: true, transcript: "Late transcript" });
    await stop;
    expect(h.state.status).toBe("idle");
    expect(h.prompt).toBe("Existing description");
    h.controller.dispose();
  });

  it("accepts only the latest recording when transcription A resolves after B", async () => {
    const first = deferred<ArchitectureTranscriptionResult>();
    const second = deferred<ArchitectureTranscriptionResult>();
    let requests = 0;
    const request: ArchitectureTranscriptionRequest = () => ++requests === 1 ? first.promise : second.promise;
    const audio = new Blob(["audio"], { type: "audio/webm" });
    const recorder: ArchitectureBrowserRecorder = {
      supported: () => true,
      start: async () => ({ ok: true, session: { stop: async () => audio, cancel: vi.fn() } }),
    };
    let prompt = "Previous text";
    const controller = new ArchitectureVoiceController(() => {}, (text) => { prompt = text; }, recorder, request);
    await controller.start();
    const a = controller.stop();
    await Promise.resolve();
    await controller.start();
    const b = controller.stop();
    await Promise.resolve();
    second.resolve({ ok: true, transcript: "Current B" });
    await b;
    first.resolve({ ok: true, transcript: "Stale A" });
    await a;
    expect(prompt).toBe("Current B");
    expect(controller.getState().status).toBe("transcript-ready");
    controller.dispose();
  });

  it("releases audio after a non-retryable transcription rejection", async () => {
    const h = harness();
    await beginRecording(h);
    const stopped = h.controller.stop();
    h.recording.resolve(new Blob(["audio"], { type: "audio/webm" }));
    await Promise.resolve();
    h.response.resolve({ ok: false, error: transcriptionFailure("invalid-transcription") });
    await stopped;
    expect(h.state).toMatchObject({ status: "error", retryableAudio: false });
    await h.controller.retry();
    expect(h.request).toHaveBeenCalledOnce();
    h.controller.dispose();
  });

  it("warns at 110 seconds and auto-stops at 120 seconds", async () => {
    vi.useFakeTimers();
    const h = harness();
    await beginRecording(h);
    await vi.advanceTimersByTimeAsync(110_000);
    expect(h.state).toMatchObject({ status: "recording", elapsedSeconds: 110, warning: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.state.status).toBe("transcribing");
    h.controller.cancel();
    h.controller.dispose();
  });

  it("discards only voice-owned text and preserves a normal typed prompt", async () => {
    const h = harness();
    h.controller.discard();
    expect(h.prompt).toBe("Existing description");
    await beginRecording(h);
    const stop = h.controller.stop();
    h.recording.resolve(new Blob(["audio"], { type: "audio/webm" }));
    await Promise.resolve();
    h.response.resolve({ ok: true, transcript: "Voice text" });
    await stop;
    expect(h.prompt).toBe("Voice text");
    h.controller.discard();
    expect(h.prompt).toBe("");
    h.controller.dispose();
  });
});

describe("browser transcription request", () => {
  it("sends a normalized raw Blob and validates the response", async () => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "audio/webm" });
      expect(options.body).toBeInstanceOf(Blob);
      return { ok: true, json: async () => ({ transcript: "  edited text  " }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestArchitectureTranscription(new Blob(["audio"], { type: "audio/webm" }), new AbortController().signal))
      .toEqual({ ok: true, transcript: "edited text" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses safe local error copy and times out after 60 seconds", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({ error: { type: "provider-unavailable", message: "Private provider detail" } }) }));
    const safe = await requestArchitectureTranscription(new Blob(["audio"], { type: "audio/webm" }), new AbortController().signal);
    expect(safe).toEqual({ ok: false, error: transcriptionFailure("provider-unavailable") });
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const pending = requestArchitectureTranscription(new Blob(["audio"], { type: "audio/webm" }), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toEqual({ ok: false, error: transcriptionFailure("transcription-timeout") });
  });

  it("does not upload an already-canceled clip", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController();
    abort.abort();
    expect(await requestArchitectureTranscription(new Blob(["audio"], { type: "audio/webm" }), abort.signal))
      .toEqual({ ok: false, error: transcriptionFailure("transcription-canceled") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
