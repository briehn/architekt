// A transcript is an input draft, not architecture or document state.
export const ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES = 3 * 1024 * 1024;
export const ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT = 20_000;

export type ArchitectureTranscriptionMediaType = "audio/webm" | "audio/mp4";
export type ArchitectureTranscriptionInput = Readonly<{
  audio: Uint8Array;
  mediaType: ArchitectureTranscriptionMediaType;
}>;

const failures = {
  "invalid-audio": { retryable: false, message: "Record a non-empty audio clip and try again." },
  "unsupported-audio": { retryable: false, message: "This recording format is not supported. Use a browser that can record WebM/Opus or MP4/AAC." },
  "audio-too-large": { retryable: false, message: "The recording is too large. Record a shorter description and try again." },
  "no-usable-transcript": { retryable: true, message: "No speech could be transcribed. Try recording again." },
  "configuration-unavailable": { retryable: false, message: "Transcription is not configured. Contact the application owner." },
  "transcription-timeout": { retryable: true, message: "Transcription took too long. Please try again." },
  "transcription-rate-limited": { retryable: true, message: "Transcription is busy. Please try again later." },
  "provider-unavailable": { retryable: true, message: "Transcription is temporarily unavailable. Please try again later." },
  "invalid-transcription": { retryable: false, message: "The transcript could not be used. Try a shorter recording." },
  "transcription-failed": { retryable: true, message: "Transcription failed. Please try again later." },
  "transcription-canceled": { retryable: true, message: "Transcription was canceled." },
  "invalid-request-origin": { retryable: false, message: "This recording request is not allowed." },
} as const;

export type ArchitectureTranscriptionFailureType = keyof typeof failures;
export type ArchitectureTranscriptionFailure = Readonly<{
  type: ArchitectureTranscriptionFailureType;
  retryable: boolean;
  message: string;
}>;

export function transcriptionFailure(type: ArchitectureTranscriptionFailureType): ArchitectureTranscriptionFailure {
  return { type, ...failures[type] };
}

export type ArchitectureTranscriptionResult =
  | { ok: true; transcript: string }
  | { ok: false; error: ArchitectureTranscriptionFailure };

export type ArchitectureTranscriptionProviderResult =
  | { ok: true; output: unknown }
  | { ok: false; type: Exclude<ArchitectureTranscriptionFailureType,
    "unsupported-audio" | "audio-too-large" | "no-usable-transcript" | "invalid-transcription" | "invalid-request-origin"> };

export interface ArchitectureTranscriptionProvider {
  transcribe(input: ArchitectureTranscriptionInput, signal: AbortSignal): Promise<ArchitectureTranscriptionProviderResult>;
}

export function isArchitectureTranscriptionFailureType(value: unknown): value is ArchitectureTranscriptionFailureType {
  return typeof value === "string" && Object.hasOwn(failures, value);
}

export function validateArchitectureTranscript(output: unknown): ArchitectureTranscriptionResult {
  if (typeof output !== "string" || output.length > ARCHITECTURE_TRANSCRIPTION_TEXT_LIMIT) {
    return { ok: false, error: transcriptionFailure("invalid-transcription") };
  }
  const transcript = output.trim();
  return transcript
    ? { ok: true, transcript }
    : { ok: false, error: transcriptionFailure("no-usable-transcript") };
}

export function normalizeArchitectureTranscriptionMediaType(value: string | null): ArchitectureTranscriptionMediaType | undefined {
  if (!value) return;
  const normalized = value.trim().toLowerCase();
  if (/^audio\/webm(?:\s*;\s*codecs\s*=\s*(?:opus|"opus"))?$/.test(normalized)) return "audio/webm";
  if (/^audio\/mp4(?:\s*;\s*codecs\s*=\s*(?:mp4a\.40\.(?:2|5)|"mp4a\.40\.(?:2|5)"))?$/.test(normalized)) return "audio/mp4";
}

export function resemblesArchitectureAudioContainer(input: ArchitectureTranscriptionInput): boolean {
  const { audio, mediaType } = input;
  if (mediaType === "audio/webm") {
    return audio.length >= 4 && audio[0] === 0x1a && audio[1] === 0x45 && audio[2] === 0xdf && audio[3] === 0xa3;
  }
  return audio.length >= 12 && audio[4] === 0x66 && audio[5] === 0x74 && audio[6] === 0x79 && audio[7] === 0x70;
}

export async function transcribeArchitectureAudio(
  input: ArchitectureTranscriptionInput,
  provider: ArchitectureTranscriptionProvider,
  signal: AbortSignal,
): Promise<ArchitectureTranscriptionResult> {
  if (signal.aborted) return { ok: false, error: transcriptionFailure("transcription-canceled") };
  if (input.mediaType !== "audio/webm" && input.mediaType !== "audio/mp4") {
    return { ok: false, error: transcriptionFailure("unsupported-audio") };
  }
  if (input.audio.byteLength > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES) {
    return { ok: false, error: transcriptionFailure("audio-too-large") };
  }
  if (input.audio.byteLength === 0 || !resemblesArchitectureAudioContainer(input)) {
    return { ok: false, error: transcriptionFailure("invalid-audio") };
  }
  const result = await provider.transcribe(input, signal);
  if (signal.aborted) return { ok: false, error: transcriptionFailure("transcription-canceled") };
  if (!result.ok) return { ok: false, error: transcriptionFailure(result.type) };
  return validateArchitectureTranscript(result.output);
}
