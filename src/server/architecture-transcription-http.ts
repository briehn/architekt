import "server-only";

import {
  ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES,
  normalizeArchitectureTranscriptionMediaType,
  resemblesArchitectureAudioContainer,
  transcribeArchitectureAudio,
  transcriptionFailure,
  type ArchitectureTranscriptionFailureType,
  type ArchitectureTranscriptionInput,
  type ArchitectureTranscriptionProvider,
} from "../application/architecture-transcription";
import { ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS } from "./architecture-transcription-config";

const statusByFailure = {
  "invalid-audio": 400,
  "unsupported-audio": 415,
  "audio-too-large": 413,
  "no-usable-transcript": 422,
  "configuration-unavailable": 503,
  "transcription-timeout": 504,
  "transcription-rate-limited": 429,
  "provider-unavailable": 503,
  "invalid-transcription": 502,
  "transcription-failed": 502,
  "transcription-canceled": 499,
  "invalid-request-origin": 403,
} satisfies Record<ArchitectureTranscriptionFailureType, number>;

function errorResponse(type: ArchitectureTranscriptionFailureType): Response {
  return Response.json({ error: transcriptionFailure(type) }, {
    status: statusByFailure[type], headers: { "Cache-Control": "no-store" },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return false;
    } catch {
      return false;
    }
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
}

type BodyResult = { ok: true; audio: Uint8Array } | { ok: false; type: ArchitectureTranscriptionFailureType };

async function readAudioBody(request: Request): Promise<BodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && !/^\d+$/.test(declaredLength)) {
    void request.body?.cancel().catch(() => {});
    return { ok: false, type: "invalid-audio" };
  }
  if (declaredLength !== null && Number(declaredLength) > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES) {
    void request.body?.cancel().catch(() => {});
    return { ok: false, type: "audio-too-large" };
  }
  if (!request.body) return { ok: false, type: "invalid-audio" };
  if (request.signal.aborted) return { ok: false, type: "transcription-canceled" };

  const reader = request.body.getReader();
  const deadline = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; deadline.abort(); }, ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS);
  const onRequestAbort = () => deadline.abort();
  request.signal.addEventListener("abort", onRequestAbort, { once: true });
  const aborted = new Promise<never>((_resolve, reject) => {
    deadline.signal.addEventListener("abort", () => reject(new Error("Audio read interrupted")), { once: true });
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (request.signal.aborted) return { ok: false, type: "transcription-canceled" };
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES) {
        return { ok: false, type: "audio-too-large" };
      }
      chunks.push(value);
    }
    if (total === 0) return { ok: false, type: "invalid-audio" };
    const audio = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, audio };
  } catch {
    return { ok: false, type: request.signal.aborted ? "transcription-canceled" : timedOut ? "transcription-timeout" : "invalid-audio" };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onRequestAbort);
    if (total > ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES || deadline.signal.aborted) {
      void reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}

export async function handleArchitectureTranscriptionPost(
  request: Request,
  createProvider: () => ArchitectureTranscriptionProvider | undefined,
): Promise<Response> {
  if (!sameOrigin(request)) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request-origin");
  }
  const mediaType = normalizeArchitectureTranscriptionMediaType(request.headers.get("content-type"));
  if (!mediaType) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("unsupported-audio");
  }
  const body = await readAudioBody(request);
  if (!body.ok) return errorResponse(body.type);
  const input: ArchitectureTranscriptionInput = { audio: body.audio, mediaType };
  if (!resemblesArchitectureAudioContainer(input)) return errorResponse("invalid-audio");
  if (request.signal.aborted) return errorResponse("transcription-canceled");
  try {
    const provider = createProvider();
    if (!provider) return errorResponse("configuration-unavailable");
    const interrupted = new Promise<never>((_resolve, reject) => {
      if (request.signal.aborted) reject(new Error("Request canceled"));
      else request.signal.addEventListener("abort", () => reject(new Error("Request canceled")), { once: true });
    });
    const result = await Promise.race([transcribeArchitectureAudio(input, provider, request.signal), interrupted]);
    if (request.signal.aborted) return errorResponse("transcription-canceled");
    if (!result.ok) return errorResponse(result.error.type);
    return Response.json({ transcript: result.transcript }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(request.signal.aborted ? "transcription-canceled" : "transcription-failed");
  }
}
