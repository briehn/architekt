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
import { admitPaidAi, allowedPaidAiOrigin, declaredBodySize, earlyPaidAiAccess, readBoundedBody, withPaidAiReservation } from "./paid-ai/request";
import { loadPaidAiRuntime, type PaidAiRuntime } from "./paid-ai/runtime";

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

type BodyResult = { ok: true; audio: Uint8Array } | { ok: false; type: ArchitectureTranscriptionFailureType };

async function readAudioBody(request: Request): Promise<BodyResult> {
  const result = await readBoundedBody(request, ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES, ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS);
  if (!result.ok) return { ok: false, type: result.reason === "too-large" ? "audio-too-large" :
    result.reason === "canceled" ? "transcription-canceled" : result.reason === "timeout" ? "transcription-timeout" : "invalid-audio" };
  return result.bytes.length ? { ok: true, audio: result.bytes } : { ok: false, type: "invalid-audio" };
}

export async function handleArchitectureTranscriptionPost(
  request: Request,
  createProvider: () => ArchitectureTranscriptionProvider | undefined,
  runtime: PaidAiRuntime | undefined = loadPaidAiRuntime(),
  allowedOrigins = process.env.ARCHITEKT_PAID_AI_ALLOWED_ORIGINS,
): Promise<Response> {
  if (!allowedPaidAiOrigin(request, allowedOrigins)) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request-origin");
  }
  const mediaType = normalizeArchitectureTranscriptionMediaType(request.headers.get("content-type"));
  if (!mediaType) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("unsupported-audio");
  }
  const declared = declaredBodySize(request, ARCHITECTURE_TRANSCRIPTION_AUDIO_LIMIT_BYTES);
  if (declared !== "valid") { void request.body?.cancel().catch(() => {}); return errorResponse(declared === "too-large" ? "audio-too-large" : "invalid-audio"); }
  const early = await earlyPaidAiAccess(request, runtime);
  if (early) return early;
  const body = await readAudioBody(request);
  if (!body.ok) return errorResponse(body.type);
  const input: ArchitectureTranscriptionInput = { audio: body.audio, mediaType };
  if (!resemblesArchitectureAudioContainer(input)) return errorResponse("invalid-audio");
  if (request.signal.aborted) return errorResponse("transcription-canceled");
  if (!runtime) return errorResponse("configuration-unavailable");
  const admission = await admitPaidAi(request, runtime, "transcription");
  if (admission instanceof Response) return admission;
  try {
    const outcome = await withPaidAiReservation(request, runtime, admission, async () => {
      if (request.signal.aborted) return { canceled: true as const };
      const provider = createProvider();
      return provider ? { result: await transcribeArchitectureAudio(input, provider, request.signal) } : { unavailable: true as const };
    });
    if (outcome.canceled || request.signal.aborted || "canceled" in outcome.value) return errorResponse("transcription-canceled");
    if ("unavailable" in outcome.value) return errorResponse("configuration-unavailable");
    const result = outcome.value.result;
    return result.ok ? Response.json({ transcript: result.transcript }, { headers: { "Cache-Control": "no-store" } }) : errorResponse(result.error.type);
  } catch {
    return errorResponse(request.signal.aborted ? "transcription-canceled" : "transcription-failed");
  }
}
