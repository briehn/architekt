import { allowedPaidAiOrigin, paidAiClientIp, paidAiSessionCookie } from "./request.ts";
import type { PaidAiRuntime } from "./runtime.ts";
import type { PaidAiDenial } from "./policy.ts";

const bodyLimitBytes = 256;
const noStore = { "Cache-Control": "no-store" };

function cookieName(runtime: PaidAiRuntime): string {
  return runtime.deployment === "development" ? "architekt-ai-session" : "__Host-architekt-ai-session";
}

function cookieAttributes(runtime: PaidAiRuntime): string {
  return `Path=/; HttpOnly; SameSite=Strict${runtime.deployment === "development" ? "" : "; Secure"}`;
}

function sessionCookie(runtime: PaidAiRuntime, credential: string): string {
  return `${cookieName(runtime)}=${credential}; Max-Age=${runtime.policy.sessionLifetimeSeconds}; ${cookieAttributes(runtime)}`;
}

function clearedCookie(runtime: PaidAiRuntime): string {
  return `${cookieName(runtime)}=; Max-Age=0; ${cookieAttributes(runtime)}`;
}


function response(status: number, body: object, cookie?: string): Response {
  return Response.json(body, { status, headers: { ...noStore, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

function denialResponse(reason: PaidAiDenial): Response {
  const status = reason === "rate-limited" ? 429 : reason === "invalid-or-expired-access" || reason === "access-required" ? 401 :
    reason === "revoked-access" ? 403 : 503;
  const message = status === 429 ? "Too many attempts. Try again later." : status === 401 ? "Invite is invalid or expired." :
    status === 403 ? "Access was revoked." : "AI access is temporarily unavailable.";
  return response(status, { error: { type: reason, message } });
}

async function readInviteBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > bodyLimitBytes)) {
    void request.body?.cancel().catch(() => {});
    return;
  }
  if (!request.body) return;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 5_000);
  const interrupted = new Promise<never>((_resolve, reject) => {
    deadline.signal.addEventListener("abort", () => reject(new Error("Body timeout")), { once: true });
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > bodyLimitBytes) return;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Reflect.ownKeys(parsed).length !== 1 || !Object.hasOwn(parsed, "inviteCode")) return;
    return (parsed as { inviteCode: unknown }).inviteCode;
  } catch { return; }
  finally {
    clearTimeout(timer);
    if (bytes > bodyLimitBytes || deadline.signal.aborted) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handlePaidAiRedeem(request: Request, runtime: PaidAiRuntime | undefined): Promise<Response> {
  if (!allowedPaidAiOrigin(request)) return response(403, { error: { type: "invalid-request-origin", message: "Request origin was rejected." } });
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))
    return response(415, { error: { type: "invalid-request", message: "Send JSON invite data." } });
  const inviteCode = await readInviteBody(request);
  if (typeof inviteCode !== "string") return response(400, { error: { type: "invalid-request", message: "Send one invite code." } });
  if (!runtime) return denialResponse("admission-store-unavailable");
  try {
    const result = await runtime.access.redeemInvite(inviteCode, paidAiClientIp(request, runtime));
    return result.ok ? response(200, { status: "enabled" }, sessionCookie(runtime, result.sessionCredential)) : denialResponse(result.reason);
  } catch { return denialResponse("unexpected-admission-failure"); }
}

export async function handlePaidAiStatus(request: Request, runtime: PaidAiRuntime | undefined): Promise<Response> {
  if (!runtime) return response(200, { status: "temporarily-unavailable" });
  try { return response(200, { status: await runtime.access.status(paidAiSessionCookie(request, runtime)) }); }
  catch { return response(200, { status: "temporarily-unavailable" }); }
}

/** Browser logout is local cookie clearing; an operator can separately revoke the grant. */
export function handlePaidAiLogout(request: Request, runtime: PaidAiRuntime | undefined): Response {
  if (!allowedPaidAiOrigin(request)) return response(403, { error: { type: "invalid-request-origin", message: "Request origin was rejected." } });
  if (!runtime) {
    const deployed = process.env.VERCEL === "1";
    return response(200, { status: "cleared" },
      `${deployed ? "__Host-" : ""}architekt-ai-session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${deployed ? "; Secure" : ""}`);
  }
  return response(200, { status: "cleared" }, clearedCookie(runtime));
}
