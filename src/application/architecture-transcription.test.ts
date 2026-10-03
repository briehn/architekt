import { describe, expect, it, vi } from "vitest";
import {
  ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES,
  ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT,
  normalizeArchitectureTranscriptionMediaType,
  resemblesArchitectureAudioContainer,
  transcribeArchitectureAudio,
  transcriptionFailure,
  type ArchitectureTranscriptionInput,
  type ArchitectureTranscriptionProviderResult,
} from "./architecture-transcription";

const webm = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x00);
const mp4 = Uint8Array.of(0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
const input: ArchitectureTranscriptionInput = { audio: webm, mediaType: "audio/webm" };

function provider(output: ArchitectureTranscriptionProviderResult) {
  const transcribe = vi.fn(async () => output);
  return { transcribe };
}

describe("architecture transcription application contract", () => {
  it.each([
    ["audio/webm", "audio/webm"], ["Audio/WebM; Codecs=OPUS", "audio/webm"],
    ['audio/webm; codecs="opus"', "audio/webm"], ["audio/mp4", "audio/mp4"],
    ["audio/mp4; codecs=mp4a.40.2", "audio/mp4"],
    ['audio/mp4; codecs="mp4a.40.5"', "audio/mp4"],
  ] as const)("normalizes %s", (value, normalized) => {
    expect(normalizeArchitectureTranscriptionMediaType(value)).toBe(normalized);
  });

  it.each([null, "", "audio/wav", "video/mp4", "audio/webm;codecs=vp9", "audio/mp4;codecs=opus", "audio/webm;foo=bar"])(
    "rejects unsupported media type %j", (value) => {
      expect(normalizeArchitectureTranscriptionMediaType(value)).toBeUndefined();
    },
  );

  it("recognizes only the minimal expected container signatures", () => {
    expect(resemblesArchitectureAudioContainer(input)).toBe(true);
    expect(resemblesArchitectureAudioContainer({ audio: mp4, mediaType: "audio/mp4" })).toBe(true);
    expect(resemblesArchitectureAudioContainer({ audio: Uint8Array.of(1, 2, 3, 4), mediaType: "audio/webm" })).toBe(false);
    expect(resemblesArchitectureAudioContainer({ audio: webm, mediaType: "audio/mp4" })).toBe(false);
  });

  it("trims valid output, preserving transcripts beyond the generation prompt limit", async () => {
    const source = provider({ ok: true, output: `  ${"x".repeat(5001)}  ` });
    const signal = new AbortController().signal;
    expect(await transcribeArchitectureAudio(input, source, signal)).toEqual({ ok: true, transcript: "x".repeat(5001) });
    expect(source.transcribe).toHaveBeenCalledExactlyOnceWith(input, signal);
    expect(await transcribeArchitectureAudio(input, provider({ ok: true, output: "x".repeat(ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT) }), signal))
      .toEqual({ ok: true, transcript: "x".repeat(ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT) });
  });

  it.each(["", "  \n\t  "])("rejects blank transcript %j", async (output) => {
    expect(await transcribeArchitectureAudio(input, provider({ ok: true, output }), new AbortController().signal))
      .toEqual({ ok: false, error: transcriptionFailure("no-usable-transcript") });
  });

  it.each([42, null, { text: "private" }, "x".repeat(ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT + 1)])(
    "rejects malformed or oversized provider output", async (output) => {
      expect(await transcribeArchitectureAudio(input, provider({ ok: true, output }), new AbortController().signal))
        .toEqual({ ok: false, error: transcriptionFailure("invalid-transcription") });
    },
  );

  it("rejects empty, invalid and oversized audio before provider invocation", async () => {
    const source = provider({ ok: true, output: "text" });
    const signal = new AbortController().signal;
    for (const audio of [new Uint8Array(), Uint8Array.of(1, 2, 3, 4)]) {
      expect(await transcribeArchitectureAudio({ ...input, audio }, source, signal)).toMatchObject({ ok: false, error: { type: "invalid-audio" } });
    }
    expect(await transcribeArchitectureAudio({ ...input, audio: new Uint8Array(ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES + 1) }, source, signal))
      .toMatchObject({ ok: false, error: { type: "audio-too-large" } });
    expect(source.transcribe).not.toHaveBeenCalled();
  });

  it.each(["transcription-timeout", "transcription-rate-limited", "provider-unavailable", "configuration-unavailable"] as const)(
    "passes expected %s failures as safe public values", async (type) => {
      expect(await transcribeArchitectureAudio(input, provider({ ok: false, type }), new AbortController().signal))
        .toEqual({ ok: false, error: transcriptionFailure(type) });
    },
  );

  it("rejects before provider work and ignores a late success after cancellation", async () => {
    const alreadyCanceled = new AbortController();
    alreadyCanceled.abort();
    const source = provider({ ok: true, output: "text" });
    expect(await transcribeArchitectureAudio(input, source, alreadyCanceled.signal))
      .toEqual({ ok: false, error: transcriptionFailure("transcription-canceled") });
    expect(source.transcribe).not.toHaveBeenCalled();

    const active = new AbortController();
    let resolve!: (value: ArchitectureTranscriptionProviderResult) => void;
    const pending = new Promise<ArchitectureTranscriptionProviderResult>((done) => { resolve = done; });
    const result = transcribeArchitectureAudio(input, { transcribe: () => pending }, active.signal);
    active.abort();
    resolve({ ok: true, output: "stale text" });
    expect(await result).toEqual({ ok: false, error: transcriptionFailure("transcription-canceled") });
  });

  it("does not hide unexpected programming failures", async () => {
    const bug = new Error("unexpected implementation failure");
    await expect(transcribeArchitectureAudio(input, { transcribe: async () => { throw bug; } }, new AbortController().signal)).rejects.toBe(bug);
  });
});
