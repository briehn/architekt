import { describe, expect, it, vi } from "vitest";
import { BrowserArchitectureRecorder } from "./browser-architecture-recorder";

class FakeMediaRecorder {
  static supported = new Set<string>(["audio/webm;codecs=opus"]);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(value: string) { return this.supported.has(value); }
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  state = "inactive";
  readonly mimeType: string;
  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
  fail() { this.onerror?.(new Event("error")); }
}

function fixture(getUserMedia?: () => Promise<MediaStream>) {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const devices = { getUserMedia: vi.fn(getUserMedia ?? (async () => stream)) } as unknown as Pick<MediaDevices, "getUserMedia">;
  const recorder = new BrowserArchitectureRecorder(devices, FakeMediaRecorder as unknown as typeof MediaRecorder);
  FakeMediaRecorder.instances = [];
  return { recorder, devices, stream, stop };
}

describe("browser architecture recorder", () => {
  it("prefers WebM/Opus and releases every track on Stop", async () => {
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2"]);
    const h = fixture();
    expect(h.recorder.supported()).toBe(true);
    const result = await h.recorder.start(new AbortController().signal, vi.fn(), vi.fn());
    expect(h.devices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(FakeMediaRecorder.instances[0].mimeType).toBe("audio/webm;codecs=opus");
    const audio = await result.session.stop();
    expect(audio.type).toBe("audio/webm");
    expect(h.stop).toHaveBeenCalled();
  });

  it("falls back to MP4/AAC and cancels cleanly", async () => {
    FakeMediaRecorder.supported = new Set(["audio/mp4;codecs=mp4a.40.2"]);
    const h = fixture();
    const result = await h.recorder.start(new AbortController().signal, vi.fn(), vi.fn());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(FakeMediaRecorder.instances[0].mimeType).toBe("audio/mp4;codecs=mp4a.40.2");
    result.session.cancel();
    expect(h.stop).toHaveBeenCalled();
  });

  it("reports unsupported, denial, and missing device without starting", async () => {
    FakeMediaRecorder.supported = new Set();
    const unsupported = fixture();
    expect(unsupported.recorder.supported()).toBe(false);
    expect(await unsupported.recorder.start(new AbortController().signal, vi.fn(), vi.fn())).toEqual({ ok: false, type: "unsupported" });
    expect(unsupported.devices.getUserMedia).not.toHaveBeenCalled();
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus"]);
    for (const [name, type] of [["NotAllowedError", "permission-denied"], ["NotFoundError", "no-device"]] as const) {
      const h = fixture(async () => { throw new DOMException("Denied", name); });
      expect(await h.recorder.start(new AbortController().signal, vi.fn(), vi.fn())).toEqual({ ok: false, type });
    }
  });

  it("releases a late stream after permission cancellation", async () => {
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus"]);
    let resolve!: (stream: MediaStream) => void;
    const h = fixture(() => new Promise((done) => { resolve = done; }));
    const abort = new AbortController();
    const started = h.recorder.start(abort.signal, vi.fn(), vi.fn());
    abort.abort();
    resolve(h.stream);
    expect(await started).toEqual({ ok: false, type: "canceled" });
    expect(h.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("releases the stream after recorder error", async () => {
    FakeMediaRecorder.supported = new Set(["audio/webm;codecs=opus"]);
    const h = fixture();
    const failure = vi.fn();
    const result = await h.recorder.start(new AbortController().signal, vi.fn(), failure);
    expect(result.ok).toBe(true);
    FakeMediaRecorder.instances[0].fail();
    expect(failure).toHaveBeenCalledOnce();
    expect(h.stop).toHaveBeenCalled();
  });
});
