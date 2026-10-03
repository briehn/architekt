import {
  ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES,
  isArchitectureTranscriptionFailureType,
  normalizeArchitectureTranscriptionMediaType,
  transcriptionFailure,
  validateArchitectureTranscript,
  type ArchitectureTranscriptionFailure,
  type ArchitectureTranscriptionResult,
} from "../application/architecture-transcription";
import {
  BrowserArchitectureRecorder,
  type ArchitectureBrowserRecorder,
  type BrowserRecorderFailure,
  type BrowserRecordingSession,
} from "./browser-architecture-recorder";

const MAX_RECORDING_SECONDS = 120;
const WARNING_SECONDS = 110;
const TRANSCRIPTION_TIMEOUT_MS = 60_000;

type ResumeState = "idle" | "transcript-ready";
export type ArchitectureVoiceState =
  | { status: "idle" }
  | { status: "requesting-permission"; resume: ResumeState }
  | { status: "recording"; resume: ResumeState; elapsedSeconds: number; warning: boolean }
  | { status: "transcribing"; resume: ResumeState }
  | { status: "transcript-ready" }
  | { status: "error"; resume: ResumeState; message: string; retryableAudio: boolean };

export type ArchitectureTranscriptionRequest = (audio: Blob, signal: AbortSignal) => Promise<ArchitectureTranscriptionResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestArchitectureTranscription(audio: Blob, signal: AbortSignal): Promise<ArchitectureTranscriptionResult> {
  if (signal.aborted) return { ok: false, error: transcriptionFailure("transcription-canceled") };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const mediaType = normalizeArchitectureTranscriptionMediaType(audio.type);
    if (!mediaType) return { ok: false, error: transcriptionFailure("unsupported-audio") };
    const response = await fetch("/api/architecture/transcribe", {
      method: "POST",
      headers: { "Content-Type": mediaType },
      body: audio,
      cache: "no-store",
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    if (controller.signal.aborted) return { ok: false, error: transcriptionFailure(signal.aborted ? "transcription-canceled" : "transcription-timeout") };
    if (response.ok) return validateArchitectureTranscript(isRecord(body) ? body.transcript : undefined);
    const error = isRecord(body) ? body.error : undefined;
    return { ok: false, error: transcriptionFailure(isRecord(error) && isArchitectureTranscriptionFailureType(error.type)
      ? error.type : "transcription-failed") };
  } catch {
    return { ok: false, error: transcriptionFailure(signal.aborted ? "transcription-canceled"
      : controller.signal.aborted ? "transcription-timeout" : "transcription-failed") };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

function recorderFailureMessage(type: BrowserRecorderFailure): string {
  switch (type) {
    case "unsupported": return "Voice recording is unavailable in this browser. You can type your description instead.";
    case "permission-denied": return "Microphone access was denied. Allow access in your browser or type your description.";
    case "no-device": return "No microphone was found. Connect one or type your description.";
    default: return "Recording could not start. Try again or type your description.";
  }
}

export class ArchitectureVoiceController {
  private state: ArchitectureVoiceState = { status: "idle" };
  private version = 0;
  private activeAbort: AbortController | null = null;
  private session: BrowserRecordingSession | null = null;
  private finishingSession: BrowserRecordingSession | null = null;
  private retryAudio: Blob | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recordingStartedAt = 0;
  private disposed = false;

  constructor(
    private readonly onChange: (state: ArchitectureVoiceState) => void,
    private readonly onTranscript: (transcript: string) => void,
    private readonly recorder: ArchitectureBrowserRecorder = new BrowserArchitectureRecorder(),
    private readonly request: ArchitectureTranscriptionRequest = requestArchitectureTranscription,
  ) {}

  getState(): ArchitectureVoiceState { return this.state; }
  supported(): boolean { return this.recorder.supported(); }

  private publish(state: ArchitectureVoiceState): void {
    if (this.disposed) return;
    this.state = state;
    this.onChange(state);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private invalidate(): number {
    const version = ++this.version;
    this.activeAbort?.abort();
    this.activeAbort = null;
    this.clearTimer();
    this.session?.cancel();
    this.session = null;
    this.finishingSession?.cancel();
    this.finishingSession = null;
    this.retryAudio = null;
    return version;
  }

  private current(version: number): boolean { return !this.disposed && version === this.version; }
  private resume(): ResumeState {
    return this.state.status === "transcript-ready" || ("resume" in this.state && this.state.resume === "transcript-ready")
      ? "transcript-ready" : "idle";
  }

  async start(): Promise<void> {
    if (this.disposed || this.state.status === "requesting-permission" || this.state.status === "recording") return;
    const resume = this.resume();
    const version = this.invalidate();
    const abort = new AbortController();
    this.activeAbort = abort;
    this.publish({ status: "requesting-permission", resume });
    const result = await this.recorder.start(abort.signal,
      (bytes) => {
        if (!this.current(version) || this.state.status !== "recording") return;
        if (bytes > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES) {
          this.invalidate();
          this.publish({ status: "error", resume, message: transcriptionFailure("audio-too-large").message, retryableAudio: false });
        }
      },
      () => {
        if (!this.current(version)) return;
        this.invalidate();
        this.publish({ status: "error", resume, message: "Recording stopped unexpectedly. Try again or type your description.", retryableAudio: false });
      });
    if (!this.current(version)) {
      if (result.ok) result.session.cancel();
      return;
    }
    if (!result.ok) {
      this.activeAbort = null;
      if (result.type !== "canceled") this.publish({ status: "error", resume, message: recorderFailureMessage(result.type), retryableAudio: false });
      return;
    }
    this.session = result.session;
    this.activeAbort = null;
    this.recordingStartedAt = Date.now();
    this.publish({ status: "recording", resume, elapsedSeconds: 0, warning: false });
    this.timer = setInterval(() => {
      if (!this.current(version) || this.state.status !== "recording") return;
      const elapsedSeconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - this.recordingStartedAt) / 1000));
      if (elapsedSeconds >= MAX_RECORDING_SECONDS) {
        void this.stop();
      } else if (elapsedSeconds !== this.state.elapsedSeconds) {
        this.publish({ ...this.state, elapsedSeconds, warning: elapsedSeconds >= WARNING_SECONDS });
      }
    }, 250);
  }

  async stop(): Promise<void> {
    if (this.state.status !== "recording" || !this.session) return;
    const { resume } = this.state;
    const version = this.version;
    const session = this.session;
    this.session = null;
    this.finishingSession = session;
    this.clearTimer();
    this.publish({ status: "transcribing", resume });
    let audio: Blob;
    try {
      audio = await session.stop();
    } catch {
      if (this.finishingSession === session) this.finishingSession = null;
      if (this.current(version)) this.publish({ status: "error", resume, message: "Recording could not be completed. Try again.", retryableAudio: false });
      return;
    }
    if (this.finishingSession === session) this.finishingSession = null;
    if (!this.current(version)) return;
    if (audio.size === 0 || audio.size > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES || !normalizeArchitectureTranscriptionMediaType(audio.type)) {
      const type = audio.size === 0 ? "invalid-audio" : audio.size > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES ? "audio-too-large" : "unsupported-audio";
      this.publish({ status: "error", resume, message: transcriptionFailure(type).message, retryableAudio: false });
      return;
    }
    await this.transcribe(audio, version, resume);
  }

  private async transcribe(audio: Blob, version: number, resume: ResumeState): Promise<void> {
    const abort = new AbortController();
    this.activeAbort = abort;
    this.publish({ status: "transcribing", resume });
    let result: ArchitectureTranscriptionResult;
    try {
      result = await this.request(audio, abort.signal);
    } catch {
      result = { ok: false, error: transcriptionFailure("transcription-failed") };
    }
    if (!this.current(version) || abort.signal.aborted) return;
    this.activeAbort = null;
    if (result.ok) {
      const validated = validateArchitectureTranscript(result.transcript);
      if (validated.ok) {
        this.retryAudio = null;
        this.onTranscript(validated.transcript);
        this.publish({ status: "transcript-ready" });
        return;
      }
      result = validated;
    }
    const error: ArchitectureTranscriptionFailure = transcriptionFailure(result.error.type);
    this.retryAudio = error.retryable ? audio : null;
    this.publish({ status: "error", resume, message: error.message, retryableAudio: error.retryable });
  }

  async retry(): Promise<void> {
    if (this.disposed || this.state.status !== "error" || !this.state.retryableAudio || !this.retryAudio) return;
    const audio = this.retryAudio;
    const resume = this.state.resume;
    const version = this.invalidate();
    await this.transcribe(audio, version, resume);
  }

  cancel(): void {
    if (this.disposed) return;
    const resume = this.resume();
    this.invalidate();
    this.publish(resume === "transcript-ready" ? { status: "transcript-ready" } : { status: "idle" });
  }

  discard(): void {
    if (this.disposed) return;
    const hadTranscript = this.resume() === "transcript-ready";
    this.invalidate();
    if (hadTranscript) this.onTranscript("");
    this.publish({ status: "idle" });
  }

  reset(): void {
    this.invalidate();
    this.publish({ status: "idle" });
  }

  onPageHidden(): void {
    if (this.state.status !== "recording" && this.state.status !== "requesting-permission") return;
    const resume = this.state.resume;
    this.invalidate();
    this.publish({ status: "error", resume, message: "Recording stopped when this tab was hidden. Record again or type your description.", retryableAudio: false });
  }

  markGenerated(): void {
    if (this.state.status === "transcript-ready") this.publish({ status: "idle" });
  }

  dispose(): void {
    this.invalidate();
    this.disposed = true;
  }
}
