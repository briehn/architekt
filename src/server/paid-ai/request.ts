import type { PaidAiRuntime } from "./runtime.ts";
import { trustedVercelClientIp } from "./credentials.ts";
import type { PaidAiDenial, PaidAiWorkload } from "./policy.ts";
import type { PaidAiReservation } from "./redis-store.ts";

export function configuredPaidAiOrigins(raw: string | undefined, deployment: "production" | "preview" | "development"): readonly string[] | undefined {
  if (!raw) return;
  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.length < 1 || entries.length > 8 || new Set(entries).size !== entries.length) return;
  try {
    for (const entry of entries) {
      const url = new URL(entry);
      if (url.origin !== entry || url.username || url.password) return;
      if (deployment !== "development" && url.protocol !== "https:") return;
      if (url.protocol === "http:" && (deployment !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return;
      if (!["http:", "https:"].includes(url.protocol)) return;
    }
    return entries;
  } catch { return; }
}

export function allowedPaidAiOrigin(request: Request, configured = process.env.ARCHITEKT_PAID_AI_ALLOWED_ORIGINS): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || origin === "null" || (site !== null && site !== "same-origin" && site !== "none")) return false;
  if (!configured) return false;
  try {
    const supplied = new URL(origin);
    if (supplied.origin !== origin || !["https:", "http:"].includes(supplied.protocol)) return false;
    return configured.split(",").some((entry) => {
      const candidate = entry.trim();
      if (!candidate || new URL(candidate).origin !== candidate) return false;
      if (candidate.startsWith("http:") && process.env.NODE_ENV === "production") return false;
      return candidate === origin;
    });
  } catch { return false; }
}

export function paidAiJsonContentType(value: string | null): boolean {
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value ?? "");
}

export function declaredBodySize(request: Request, limit: number): "valid" | "invalid" | "too-large" {
  const value = request.headers.get("content-length");
  if (value === null) return "valid";
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return "invalid";
  return Number(value) > limit ? "too-large" : "valid";
}

export type BoundedBodyResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: "invalid" | "too-large" | "timeout" | "canceled" };

/** Transport-only reader; semantic JSON/audio validation remains route-owned. */
export async function readBoundedBody(request: Request, limit: number, timeoutMs = 15_000): Promise<BoundedBodyResult> {
  const declared = declaredBodySize(request, limit);
  if (declared !== "valid") { void request.body?.cancel().catch(() => {}); return { ok: false, reason: declared === "too-large" ? "too-large" : "invalid" }; }
  if (!request.body) return { ok: false, reason: "invalid" };
  if (request.signal.aborted) return { ok: false, reason: "canceled" };
  const reader = request.body.getReader();
  const stop = new AbortController();
  let timedOut = false;
  const onAbort = () => stop.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; stop.abort(); }, timeoutMs);
  const interrupted = new Promise<never>((_resolve, reject) => {
    stop.signal.addEventListener("abort", () => reject(new Error("Body read interrupted")), { once: true });
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancelReader = false;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      total += value.byteLength;
      if (total > limit) { cancelReader = true; return { ok: false, reason: "too-large" }; }
      chunks.push(value);
    }
    if (request.signal.aborted) return { ok: false, reason: "canceled" };
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, bytes };
  } catch {
    cancelReader = true;
    return { ok: false, reason: request.signal.aborted ? "canceled" : timedOut ? "timeout" : "invalid" };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    if (cancelReader || stop.signal.aborted) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function parseBoundedJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export function paidAiSessionCookie(request: Request, runtime: PaidAiRuntime): string | undefined {
  const name = runtime.deployment === "development" ? "architekt-ai-session" : "__Host-architekt-ai-session";
  const matches = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}

export function paidAiClientIp(request: Request, runtime: PaidAiRuntime): string | undefined {
  return runtime.deployment === "development" ? runtime.localClientIp : trustedVercelClientIp(request, true);
}

export function paidAiDenialResponse(reason: PaidAiDenial): Response {
  const status = reason === "access-required" || reason === "invalid-or-expired-access" ? 401 :
    reason === "revoked-access" ? 403 :
    reason === "rate-limited" || reason === "concurrency-limited" || reason === "grant-allowance-exhausted" ? 429 : 503;
  const message = status === 401 ? "Enable AI access with a demo code." :
    reason === "revoked-access" ? "AI access is no longer available on this browser." :
    reason === "grant-allowance-exhausted" ? "Your demo AI allowance has been used." :
    status === 429 ? "Another AI request is running, or requests are arriving too quickly. Try again shortly." :
    "AI features are temporarily unavailable.";
  return Response.json({ error: { type: reason, message } }, { status, headers: {
    "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "10" } : {}),
  } });
}

export async function earlyPaidAiAccess(request: Request, runtime: PaidAiRuntime | undefined): Promise<Response | null> {
  if (!runtime) return paidAiDenialResponse("admission-store-unavailable");
  try {
    const status = await runtime.access.status(paidAiSessionCookie(request, runtime));
    return status === "enabled" ? null : paidAiDenialResponse(status === "expired" ? "invalid-or-expired-access" :
      status === "revoked" ? "revoked-access" : status === "access-required" ? "access-required" : "admission-store-unavailable");
  } catch { return paidAiDenialResponse("unexpected-admission-failure"); }
}

export async function admitPaidAi(request: Request, runtime: PaidAiRuntime, workload: PaidAiWorkload): Promise<PaidAiReservation | Response> {
  try {
    const result = await runtime.access.admitPaidAiRequest({ sessionCredential: paidAiSessionCookie(request, runtime),
      trustedClientIp: paidAiClientIp(request, runtime), workload });
    return result.ok ? result.reservation : paidAiDenialResponse(result.reason);
  } catch { return paidAiDenialResponse("unexpected-admission-failure"); }
}

/** A raced caller abort is ambiguous until provider completion can be observed. */
export async function withPaidAiReservation<T>(request: Request, runtime: PaidAiRuntime, reservation: PaidAiReservation,
  execute: () => Promise<T>): Promise<{ canceled: true } | { canceled: false; value: T }> {
  let completed = false;
  let started = false;
  let onAbort: (() => void) | undefined;
  const canceled = new Promise<{ canceled: true }>((resolve) => {
    onAbort = () => resolve({ canceled: true });
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    if (request.signal.aborted) return { canceled: true };
    started = true;
    const result = await Promise.race([execute().then((value) => { completed = true; return { canceled: false as const, value }; },
      (error: unknown) => { completed = true; throw error; }), canceled]);
    return result;
  } finally {
    if (onAbort) request.signal.removeEventListener("abort", onAbort);
    try { await runtime.access.settleReservation(reservation, !started || completed ? "known" : "ambiguous"); }
    catch { /* The charged reservation retains its TTL; never retry an ambiguous release. */ }
  }
}
