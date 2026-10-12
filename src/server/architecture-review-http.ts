import "server-only";

import { reviewFailure, type ArchitectureReview, type ArchitectureReviewFailure, type ArchitectureReviewProvider } from "../application/architecture-review/architecture-review";
import { buildReviewEvidenceCatalog } from "../application/architecture-review/review-evidence";
import { reviewPreparedArchitecture } from "../application/architecture-review/review-architecture";
import { prepareArchitectureReviewSnapshot } from "../application/architecture-review/review-snapshot";
import { ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES, ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS,
  ARCHITECTURE_REVIEW_EXPANDED_INPUT_LIMIT_BYTES, ARCHITECTURE_REVIEW_RESPONSE_LIMIT_BYTES } from "./architecture-review-config";
import { parseArchitectureReviewRequest } from "./architecture-review-request";
import { architectureReviewInstructions, architectureReviewSchema } from "./architecture-review-schema";
import { admitPaidAi, allowedPaidAiOrigin, declaredBodySize, earlyPaidAiAccess, paidAiJsonContentType,
  parseBoundedJson, readBoundedBody, withPaidAiReservation } from "./paid-ai/request";
import { loadPaidAiRuntime, type PaidAiRuntime } from "./paid-ai/runtime";

type FailureType = ArchitectureReviewFailure["type"];
const statusByFailure = {
  "invalid-request": 400,
  "invalid-request-origin": 403,
  "empty-architecture": 422,
  "review-limit-exceeded": 413,
  "invalid-context": 400,
  "configuration-unavailable": 503,
  "review-timeout": 504,
  "review-canceled": 499,
  "review-rate-limited": 429,
  "provider-unavailable": 503,
  "provider-refused": 422,
  "provider-incomplete": 502,
  "invalid-provider-result": 502,
  "review-failed": 502,
} satisfies Record<FailureType, number>;

function errorResponse(type: FailureType, detail?: string): Response {
  return Response.json({ error: reviewFailure(type, detail) }, {
    status: statusByFailure[type], headers: { "Cache-Control": "no-store" },
  });
}

/** Defensive HTTP ceiling, independent of provider/schema size limits. */
export function boundedReviewSuccessResponse(review: ArchitectureReview): Response {
  const text = JSON.stringify({ review });
  if (Buffer.byteLength(text, "utf8") > ARCHITECTURE_REVIEW_RESPONSE_LIMIT_BYTES) return errorResponse("invalid-provider-result");
  return new Response(text, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

type BodyResult = { ok: true; input: unknown } | { ok: false; type: "invalid-request" | "review-limit-exceeded" | "review-timeout" | "review-canceled" };

async function readReviewBody(request: Request): Promise<BodyResult> {
  const result = await readBoundedBody(request, ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES, ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS);
  if (!result.ok) return { ok: false, type: result.reason === "too-large" ? "review-limit-exceeded" :
    result.reason === "timeout" ? "review-timeout" : result.reason === "canceled" ? "review-canceled" : "invalid-request" };
  try { return { ok: true, input: parseBoundedJson(result.bytes) }; }
  catch { return { ok: false, type: "invalid-request" }; }
}

export async function handleArchitectureReviewPost(
  request: Request,
  createProvider: () => ArchitectureReviewProvider | undefined,
  runtime: PaidAiRuntime | undefined = loadPaidAiRuntime(),
  allowedOrigins = process.env.ARCHITEKT_PAID_AI_ALLOWED_ORIGINS,
): Promise<Response> {
  if (!allowedPaidAiOrigin(request, allowedOrigins)) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request-origin");
  }
  if (!paidAiJsonContentType(request.headers.get("content-type"))) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request");
  }
  const declared = declaredBodySize(request, ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES);
  if (declared !== "valid") { void request.body?.cancel().catch(() => {}); return errorResponse(declared === "too-large" ? "review-limit-exceeded" : "invalid-request"); }
  const early = await earlyPaidAiAccess(request, runtime);
  if (early) return early;
  const body = await readReviewBody(request);
  if (!body.ok) return errorResponse(body.type);
  const parsed = parseArchitectureReviewRequest(body.input);
  if (!parsed.ok) return errorResponse(parsed.error.type, parsed.error.detail);
  if (request.signal.aborted) return errorResponse("review-canceled");
  const prepared = prepareArchitectureReviewSnapshot(parsed.request.graph, parsed.request.designContext);
  if (!prepared.ok) return errorResponse(prepared.error.type, prepared.error.detail);
  const index = buildReviewEvidenceCatalog(prepared.snapshot);
  const expanded = JSON.stringify({ snapshot: prepared.snapshot, catalog: index.catalog,
    instructions: architectureReviewInstructions, schema: architectureReviewSchema(index.catalog) });
  if (Buffer.byteLength(expanded, "utf8") > ARCHITECTURE_REVIEW_EXPANDED_INPUT_LIMIT_BYTES) return errorResponse("review-limit-exceeded", "expanded review input");
  if (request.signal.aborted) return errorResponse("review-canceled");
  if (!runtime) return errorResponse("configuration-unavailable");
  const admission = await admitPaidAi(request, runtime, "review");
  if (admission instanceof Response) return admission;
  try {
    const outcome = await withPaidAiReservation(request, runtime, admission, async () => {
      if (request.signal.aborted) return { canceled: true as const };
      const provider = createProvider();
      return provider ? { result: await reviewPreparedArchitecture(prepared.snapshot, index, provider, request.signal) } : { unavailable: true as const };
    });
    if (outcome.canceled || request.signal.aborted || "canceled" in outcome.value) return errorResponse("review-canceled");
    if ("unavailable" in outcome.value) return errorResponse("configuration-unavailable");
    const result = outcome.value.result;
    return result.ok ? boundedReviewSuccessResponse(result.review) : errorResponse(result.error.type, result.error.detail);
  } catch {
    return errorResponse(request.signal.aborted ? "review-canceled" : "review-failed");
  }
}
