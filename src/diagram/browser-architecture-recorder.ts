import {
  ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES,
  normalizeArchitectureTranscriptionMediaType,
  type ArchitectureTranscriptionMediaType,
} from "../application/architecture-transcription";

const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4;codecs=mp4a.40.5",
  "audio/webm",
  "audio/mp4",
] as const;

export type BrowserRecorderFailure = "unsupported" | "permission-denied" | "no-device" | "recording-failed" | "canceled";
export type BrowserRecorderStartResult =
  | { ok: true; session: BrowserRecordingSession }
  | { ok: false; type: BrowserRecorderFailure };

export interface BrowserRecordingSession {
  stop(): Promise<Blob>;
  cancel(): void;
}

export interface ArchitectureBrowserRecorder {
  supported(): boolean;
  start(signal: AbortSignal, onSize: (bytes: number) => void, onFailure: () => void): Promise<BrowserRecorderStartResult>;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function recordingType(recorder: typeof MediaRecorder | undefined): string | undefined {
  if (!recorder || typeof recorder.isTypeSupported !== "function") return;
  for (const candidate of RECORDING_TYPES) {
    try {
      if (recorder.isTypeSupported(candidate)) return candidate;
    } catch {
      return;
    }
  }
}

class MediaRecordingSession implements BrowserRecordingSession {
  private chunks: Blob[] = [];
  private totalBytes = 0;
  private finished = false;
  private stopping = false;
  private resolveStop: ((blob: Blob) => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;

  constructor(
    private readonly stream: MediaStream,
    private readonly recorder: MediaRecorder,
    private readonly mediaType: ArchitectureTranscriptionMediaType,
    private readonly onSize: (bytes: number) => void,
    private readonly onFailure: () => void,
  ) {
    recorder.ondataavailable = (event) => {
      if (this.finished || event.data.size === 0) return;
      this.totalBytes += event.data.size;
      if (this.totalBytes > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES) {
        this.onSize(this.totalBytes);
        return;
      }
      this.chunks.push(event.data);
      this.onSize(this.totalBytes);
    };
    recorder.onerror = () => {
      if (this.finished) return;
      this.onFailure();
      this.cancel();
    };
    recorder.onstop = () => {
      if (this.finished) return;
      this.finished = true;
      stopTracks(this.stream);
      const audio = new Blob(this.chunks, { type: this.mediaType });
      this.chunks = [];
      this.resolveStop?.(audio);
      this.resolveStop = null;
      this.rejectStop = null;
    };
    recorder.start(1000);
  }

  stop(): Promise<Blob> {
    if (this.finished || this.stopping) return Promise.reject(new Error("Recording has already stopped"));
    this.stopping = true;
    const result = new Promise<Blob>((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
    });
    try {
      this.recorder.stop();
    } catch {
      this.cancel();
    } finally {
      stopTracks(this.stream);
    }
    return result;
  }

  cancel(): void {
    if (this.finished) return;
    this.finished = true;
    this.chunks = [];
    this.recorder.ondataavailable = null;
    this.recorder.onerror = null;
    this.recorder.onstop = null;
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // A failed recorder still must release the stream.
    }
    stopTracks(this.stream);
    this.rejectStop?.(new Error("Recording canceled"));
    this.resolveStop = null;
    this.rejectStop = null;
  }
}

export class BrowserArchitectureRecorder implements ArchitectureBrowserRecorder {
  constructor(
    private readonly devices: Pick<MediaDevices, "getUserMedia"> | undefined = typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    private readonly recorderClass: typeof MediaRecorder | undefined = typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
  ) {}

  supported(): boolean {
    return typeof this.devices?.getUserMedia === "function" && recordingType(this.recorderClass) !== undefined;
  }

  async start(signal: AbortSignal, onSize: (bytes: number) => void, onFailure: () => void): Promise<BrowserRecorderStartResult> {
    const selectedType = recordingType(this.recorderClass);
    if (!this.devices?.getUserMedia || !this.recorderClass || !selectedType) return { ok: false, type: "unsupported" };
    if (signal.aborted) return { ok: false, type: "canceled" };
    let stream: MediaStream;
    try {
      stream = await this.devices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      if (signal.aborted) return { ok: false, type: "canceled" };
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        return { ok: false, type: "permission-denied" };
      }
      if (error instanceof DOMException && error.name === "NotFoundError") return { ok: false, type: "no-device" };
      return { ok: false, type: "recording-failed" };
    }
    if (signal.aborted) {
      stopTracks(stream);
      return { ok: false, type: "canceled" };
    }
    try {
      const recorder = new this.recorderClass(stream, { mimeType: selectedType, audioBitsPerSecond: 64_000 });
      const mediaType = normalizeArchitectureTranscriptionMediaType(recorder.mimeType || selectedType);
      if (!mediaType) {
        stopTracks(stream);
        return { ok: false, type: "unsupported" };
      }
      return { ok: true, session: new MediaRecordingSession(stream, recorder, mediaType, onSize, onFailure) };
    } catch {
      stopTracks(stream);
      return { ok: false, type: "recording-failed" };
    }
  }
}
