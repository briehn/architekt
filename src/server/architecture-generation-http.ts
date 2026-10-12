import "server-only";

import {
  generationFailure, parseArchitectureGenerationRequest,
  type ArchitectureGenerationFailureType, type ArchitectureGenerationProvider,
} from "../application/architecture-generation";
import { generateArchitecture } from "../application/generate-architecture";
import { admitPaidAi, allowedPaidAiOrigin, declaredBodySize, earlyPaidAiAccess,
  paidAiJsonContentType, parseBoundedJson, readBoundedBody, withPaidAiReservation } from "./paid-ai/request";
import { loadPaidAiRuntime, type PaidAiRuntime } from "./paid-ai/runtime";

export const ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES = 32 * 1024;

const statusByFailure = {
  "invalid-request": 400, "configuration-unavailable": 503, "generation-refused": 422,
  "generation-incomplete": 422, "generation-timeout": 504, "generation-rate-limited": 429,
  "provider-unavailable": 503, "invalid-generation": 502, "generation-failed": 502,
} satisfies Record<ArchitectureGenerationFailureType, number>;

function errorResponse(type: ArchitectureGenerationFailureType): Response {
  return Response.json({ error: generationFailure(type) }, {
    status: statusByFailure[type], headers: { "Cache-Control": "no-store" },
  });
}

function transportError(status: number, type: string, message: string): Response {
  return Response.json({ error: { type, message, retryable: status >= 500 } },
    { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleArchitectureGenerationPost(
  request: Request,
  createProvider: () => ArchitectureGenerationProvider | undefined,
  runtime: PaidAiRuntime | undefined = loadPaidAiRuntime(),
  allowedOrigins = process.env.ARCHITEKT_PAID_AI_ALLOWED_ORIGINS,
): Promise<Response> {
  if (!allowedPaidAiOrigin(request, allowedOrigins)) return transportError(403, "invalid-request-origin", "Request origin was rejected.");
  if (!paidAiJsonContentType(request.headers.get("content-type"))) return transportError(415, "invalid-request", "Send a JSON request.");
  const declared = declaredBodySize(request, ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES);
  if (declared !== "valid") { void request.body?.cancel().catch(() => {}); return transportError(declared === "too-large" ? 413 : 400, "invalid-request", "Invalid request body."); }
  const early = await earlyPaidAiAccess(request, runtime);
  if (early) return early;
  const body = await readBoundedBody(request, ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES);
  if (!body.ok) return transportError(body.reason === "too-large" ? 413 : body.reason === "timeout" ? 408 :
    body.reason === "canceled" ? 499 : 400, "invalid-request", "Invalid request body.");
  let input: unknown;
  try { input = parseBoundedJson(body.bytes); } catch { return errorResponse("invalid-request"); }
  const parsed = parseArchitectureGenerationRequest(input);
  if (!parsed) return errorResponse("invalid-request");
  if (request.signal.aborted) return transportError(499, "request-canceled", "Request canceled.");
  if (!runtime) return transportError(503, "admission-store-unavailable", "AI features are temporarily unavailable.");
  const admission = await admitPaidAi(request, runtime, "generate");
  if (admission instanceof Response) return admission;
  try {
    const result = await withPaidAiReservation(request, runtime, admission, async () => {
      if (request.signal.aborted) return { canceled: true as const };
      const provider = createProvider();
      if (!provider) return { unavailable: true as const };
      return { generated: await generateArchitecture(parsed, provider, request.signal) };
    });
    if (result.canceled || request.signal.aborted || "canceled" in result.value) return transportError(499, "request-canceled", "Request canceled.");
    if ("unavailable" in result.value) return errorResponse("configuration-unavailable");
    const generated = result.value.generated;
    return generated.ok ? Response.json(generated.proposal, { headers: { "Cache-Control": "no-store" } }) : errorResponse(generated.error.type);
  } catch { return errorResponse(request.signal.aborted ? "generation-timeout" : "generation-failed"); }
}
