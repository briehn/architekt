import "server-only";

import { reviewFailure, type ArchitectureReview, type ArchitectureReviewFailure, type ArchitectureReviewProvider } from "../application/architecture-review/architecture-review";
import { buildReviewEvidenceCatalog } from "../application/architecture-review/review-evidence";
import { reviewPreparedArchitecture } from "../application/architecture-review/review-architecture";
import { prepareArchitectureReviewSnapshot } from "../application/architecture-review/review-snapshot";
import { ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES, ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS,
  ARCHITECTURE_REVIEW_EXPANDED_INPUT_LIMIT_BYTES, ARCHITECTURE_REVIEW_RESPONSE_LIMIT_BYTES } from "./architecture-review-config";
import { parseArchitectureReviewRequest } from "./architecture-review-request";
import { architectureReviewInstructions, architectureReviewSchema } from "./architecture-review-schema";

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

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).origin !== new URL(request.url).origin) return false; }
    catch { return false; }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

type BodyResult = { ok: true; input: unknown } | { ok: false; type: "invalid-request" | "review-limit-exceeded" | "review-timeout" | "review-canceled" };

async function readReviewBody(request: Request): Promise<BodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) {
    void request.body?.cancel().catch(() => {});
    return { ok: false, type: "invalid-request" };
  }
  if (declared !== null && Number(declared) > ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES) {
    void request.body?.cancel().catch(() => {});
    return { ok: false, type: "review-limit-exceeded" };
  }
  if (!request.body) return { ok: false, type: "invalid-request" };
  if (request.signal.aborted) return { ok: false, type: "review-canceled" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let timedOut = false;
  let interrupted = false;
  let bytes = 0;
  let text = "";
  let readFailed = false;
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; stop.abort(); }, ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS);
  const aborted = new Promise<never>((_resolve, reject) => {
    stop.signal.addEventListener("abort", () => reject(new Error("Body read interrupted")), { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES) {
        readFailed = true;
        return { ok: false, type: "review-limit-exceeded" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (text.length === 0) return { ok: false, type: "invalid-request" };
    return { ok: true, input: JSON.parse(text) as unknown };
  } catch {
    interrupted = true;
    return { ok: false, type: request.signal.aborted ? "review-canceled" : timedOut ? "review-timeout" : "invalid-request" };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    if (readFailed || interrupted || stop.signal.aborted) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleArchitectureReviewPost(
  request: Request,
  createProvider: () => ArchitectureReviewProvider | undefined,
): Promise<Response> {
  if (!sameOrigin(request)) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request-origin");
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
    void request.body?.cancel().catch(() => {});
    return errorResponse("invalid-request");
  }
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
  try {
    const provider = createProvider();
    if (!provider) return errorResponse("configuration-unavailable");
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Request canceled"));
      if (request.signal.aborted) onAbort();
      else request.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([
        reviewPreparedArchitecture(prepared.snapshot, index, provider, request.signal), interrupted,
      ]);
      if (request.signal.aborted) return errorResponse("review-canceled");
      if (!result.ok) return errorResponse(result.error.type, result.error.detail);
      return boundedReviewSuccessResponse(result.review);
    } finally {
      if (onAbort) request.signal.removeEventListener("abort", onAbort);
    }
  } catch {
    return errorResponse(request.signal.aborted ? "review-canceled" : "review-failed");
  }
}
