import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaidAiAccess, type PaidAiEvent } from "./access.ts";
import { credentialHash, parseInviteCode, randomCredential, trustedVercelClientIp } from "./credentials.ts";
import { handlePaidAiLogout, handlePaidAiRedeem, handlePaidAiStatus } from "./http.ts";
import { createPaidAiOperator, operatorCommandArgs } from "./operator.ts";
import { DEFAULT_PAID_AI_POLICY, parsePaidAiPolicyOverride } from "./policy.ts";
import { createUpstashRedisExecutor, RedisStateError, RedisUnavailableError, type PaidAiStore } from "./redis-store.ts";
import { loadPaidAiRuntime, type PaidAiRuntime } from "./runtime.ts";

const credentialSecret = "a".repeat(64);
const ipSecret = "b".repeat(64);

function fakeStore() {
  const state = { inviteHash: "", sessionHash: "", grantId: "", redeemed: false, enabled: true, released: 0,
    redeemResult: "enabled", admissionResult: "approved", lookupResult: "", paidAttempts: 0, lastIpHash: "" };
  const store: PaidAiStore = {
    async issueInvite(input) { state.inviteHash = input.hash; state.grantId = input.grantId; return "issued"; },
    async redeemInvite(input) { state.sessionHash = input.sessionHash; state.lastIpHash = input.ipHash; state.redeemed = true; state.lookupResult = input.grantId; return state.redeemResult; },
    async lookupSession() { return state.lookupResult || undefined; },
    async accessStatus() { return state.enabled ? "enabled" : "global-ai-disabled"; },
    async recordPaidAttempt(input) { state.lastIpHash = input; state.paidAttempts++; return "allowed"; },
    async admit(input) { return state.admissionResult === "approved" ? { status: "approved", reservation: {
      id: "reservation", grantId: input.grantId, workload: input.workload, units: 8, expiresInSeconds: 120,
    } } : { status: state.admissionResult }; },
    async release() { state.released++; return state.released === 1 ? "released" : "already-released"; },
    async setEnabled(enabled) { state.enabled = enabled; },
    async operatorStatus(kind) { return kind === "switch" ? [state.enabled ? "enabled" : "disabled"] :
      kind === "invite" ? ["issued", "1", "2", ""] : ["active", "1", "2", "0"]; },
    async revoke() { return "revoked"; },
  };
  return { store, state };
}

function accessFixture() {
  const { store, state } = fakeStore();
  const events: PaidAiEvent[] = [];
  const access = createPaidAiAccess({ store, policy: DEFAULT_PAID_AI_POLICY, credentialSecret, ipSecret,
    telemetry: (event) => events.push(event) });
  return { store, state, access, events };
}

describe("paid-AI credentials and configuration", () => {
  it("generates 256-bit independent credentials and hashes them by purpose without storing plaintext", async () => {
    const { state, access } = accessFixture();
    const first = randomCredential(); const second = randomCredential();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    const issued = await access.issueInvite();
    expect(parseInviteCode(issued.inviteCode)).toEqual({ id: issued.inviteId, credential: issued.inviteCode.split(".")[1] });
    expect(state.inviteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.inviteHash).not.toContain(issued.inviteCode);
    expect(credentialHash(credentialSecret, "invite", first)).not.toBe(credentialHash(credentialSecret, "session", first));
  });

  it("rejects missing and malformed production config without a fallback", () => {
    expect(loadPaidAiRuntime({})).toBeUndefined();
    expect(loadPaidAiRuntime({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "token",
      ARCHITEKT_PAID_AI_CREDENTIAL_SECRET: credentialSecret, ARCHITEKT_PAID_AI_IP_SECRET: ipSecret,
      VERCEL: "1", VERCEL_ENV: "unknown" })).toBeUndefined();
    expect(loadPaidAiRuntime({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token", ARCHITEKT_PAID_AI_CREDENTIAL_SECRET: credentialSecret,
      ARCHITEKT_PAID_AI_IP_SECRET: ipSecret })).toBeUndefined();
    expect(parsePaidAiPolicyOverride('{"grantConcurrent":0}')).toBeUndefined();
    expect(parsePaidAiPolicyOverride('{"unknown":1}')).toBeUndefined();
    expect(parsePaidAiPolicyOverride(undefined)?.reviewUnits).toBe(8);
  });

  it("accepts only a Vercel-provided single IP in deployed mode", () => {
    const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.4" } });
    expect(trustedVercelClientIp(request, true)).toBe("203.0.113.4");
    expect(trustedVercelClientIp(request, false)).toBeUndefined();
    expect(trustedVercelClientIp(new Request("https://example.com", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), true)).toBeUndefined();
  });

  it("uses bounded Upstash EVAL and fails closed on transport or malformed state", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(["EVAL", "return 1", 1, "key", "argument"]);
      return Response.json({ result: 1 });
    }) as typeof fetch;
    expect(await createUpstashRedisExecutor("https://example.upstash.io", "token", fetcher).eval("return 1", ["key"], ["argument"])).toBe(1);
    await expect(createUpstashRedisExecutor("https://example.upstash.io", "token", async () => { throw Error("secret"); }).eval("", [], [])).rejects.toBeInstanceOf(RedisUnavailableError);
    await expect(createUpstashRedisExecutor("https://example.upstash.io", "token", async () => Response.json({ error: "secret" })).eval("", [], [])).rejects.toBeInstanceOf(RedisStateError);
  });
});

describe("paid-AI access and operator seam", () => {
  it("redeems into a distinct session, charges the grant path, and retains ambiguous reservations", async () => {
    const { state, access, events } = accessFixture();
    const issued = await access.issueInvite();
    const redeemed = await access.redeemInvite(issued.inviteCode, "203.0.113.4");
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) throw Error("Expected test access");
    expect(redeemed.sessionCredential).not.toBe(issued.inviteCode);
    expect(state.sessionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.sessionHash).not.toContain(redeemed.sessionCredential);
    expect(state.lastIpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.lastIpHash).not.toContain("203.0.113.4");
    expect(await access.status(redeemed.sessionCredential)).toBe("enabled");
    const admitted = await access.admitPaidAiRequest({ sessionCredential: redeemed.sessionCredential, trustedClientIp: "203.0.113.4", workload: "review" });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) throw Error("Expected test reservation");
    await access.settleReservation(admitted.reservation, "ambiguous");
    expect(state.released).toBe(0);
    await access.settleReservation(admitted.reservation, "known");
    expect(state.released).toBe(1);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ event: "paid-admission", units: 8 })]));
    expect(JSON.stringify(events)).not.toContain(issued.inviteCode);
    expect(JSON.stringify(events)).not.toContain(redeemed.sessionCredential);
    expect(JSON.stringify(events)).not.toContain("203.0.113.4");
  });

  it("denies missing, malformed, revoked, disabled, and unavailable access safely", async () => {
    const { access, state, store } = accessFixture();
    expect(await access.admitPaidAiRequest({ trustedClientIp: "203.0.113.4", workload: "generate" })).toEqual({ ok: false, reason: "access-required" });
    expect(state.paidAttempts).toBe(1);
    expect(await access.admitPaidAiRequest({ trustedClientIp: "203.0.113.4", sessionCredential: "bad", workload: "review" })).toEqual({ ok: false, reason: "invalid-or-expired-access" });
    expect(await access.admitPaidAiRequest({ sessionCredential: randomCredential(), workload: "review" })).toEqual({ ok: false, reason: "admission-store-unavailable" });
    state.lookupResult = "a".repeat(32);
    state.admissionResult = "revoked-access";
    expect(await access.admitPaidAiRequest({ trustedClientIp: "203.0.113.4", sessionCredential: randomCredential(), workload: "review" })).toEqual({ ok: false, reason: "revoked-access" });
    state.admissionResult = "global-ai-disabled";
    expect(await access.admitPaidAiRequest({ trustedClientIp: "203.0.113.4", sessionCredential: randomCredential(), workload: "review" })).toEqual({ ok: false, reason: "global-ai-disabled" });
    store.recordPaidAttempt = async () => { throw new RedisUnavailableError(); };
    expect(await access.admitPaidAiRequest({ trustedClientIp: "203.0.113.4", workload: "review" })).toEqual({ ok: false, reason: "admission-store-unavailable" });
  });

  it("has safe operator status, explicit switch control, and revocation", async () => {
    const { store, access } = accessFixture();
    const operator = createPaidAiOperator(store, access);
    expect(await operator.status("switch")).toEqual({ state: "enabled" });
    expect(await operator.setEnabled(false)).toEqual({ state: "disabled" });
    expect(await operator.status("switch")).toEqual({ state: "disabled" });
    const issued = await operator.issueInvite();
    expect(await operator.status("invite", issued.inviteId)).toEqual({ state: "issued", createdAtUnixSeconds: 1, expiresAtUnixSeconds: 2 });
    expect(JSON.stringify(await operator.status("invite", issued.inviteId))).not.toContain(issued.inviteCode);
    expect(await operator.revoke("invite", issued.inviteId)).toEqual({ state: "revoked" });
    expect(operatorCommandArgs(["enable"], "production")).toBeUndefined();
    expect(operatorCommandArgs(["--confirm-production", "status", "switch"], "production")).toEqual(["status", "switch"]);
    expect(operatorCommandArgs(["enable"], "preview")).toEqual(["enable"]);
  });
});

describe("paid-AI access HTTP seam", () => {
  beforeEach(() => vi.stubEnv("ARCHITEKT_PAID_AI_ALLOWED_ORIGINS", "https://example.com"));
  afterEach(() => vi.unstubAllEnvs());
  function runtimeFixture(deployment: "production" | "development" = "development") {
    const { store, access, state } = accessFixture();
    const runtime: PaidAiRuntime = { store: store as ReturnType<typeof import("./redis-store.ts").createPaidAiRedisStore>,
      access, policy: DEFAULT_PAID_AI_POLICY, deployment, localClientIp: "203.0.113.4" };
    return { runtime, state };
  }
  const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://example.com/api/ai-access/redeem", {
    method: "POST", headers: { origin: "https://example.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  it("sets a host-only HttpOnly Strict cookie and returns no credentials in JSON", async () => {
    const fixture = runtimeFixture("production").runtime;
    const issued = await fixture.access.issueInvite();
    const response = await handlePaidAiRedeem(post({ inviteCode: issued.inviteCode }, { "x-forwarded-for": "203.0.113.4" }), fixture);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(/^__Host-architekt-ai-session=[A-Za-z0-9_-]{43}; Max-Age=14400; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    expect(response.headers.get("set-cookie")).not.toContain("Domain=");
    expect(await response.json()).toEqual({ status: "enabled" });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const status = await handlePaidAiStatus(new Request("https://example.com/api/ai-access/status", { headers: { cookie } }), fixture);
    expect(await status.json()).toEqual({ status: "enabled" });
    expect(status.headers.get("cache-control")).toBe("no-store");
    const logout = handlePaidAiLogout(new Request("https://example.com/api/ai-access/logout", { method: "POST", headers: { origin: "https://example.com" } }), fixture);
    expect(logout.headers.get("set-cookie")).toBe("__Host-architekt-ai-session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict; Secure");
    expect(await logout.json()).toEqual({ status: "cleared" });
  });

  it("rejects unsafe origin, content type, malformed and oversized bodies without CORS", async () => {
    const fixture = runtimeFixture().runtime;
    const cases = [
      [post({ inviteCode: "x" }, { origin: "https://other.example" }), 403],
      [post({ inviteCode: "x" }, { "content-type": "text/plain" }), 415],
      [post({ unexpected: "x" }), 400],
      [post({ inviteCode: "x".repeat(300) }), 400],
    ] as const;
    for (const [request, expectedStatus] of cases) {
      const response = await handlePaidAiRedeem(request, fixture);
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(await (await handlePaidAiStatus(new Request("https://example.com"), undefined)).json()).toEqual({ status: "temporarily-unavailable" });
  });

  it("maps invalid, revoked, rate-limited, disabled, and missing-store access without cookie leaks", async () => {
    const { runtime, state } = runtimeFixture();
    for (const [reason, status] of [["invalid-or-expired-access", 401], ["revoked-access", 403],
      ["rate-limited", 429], ["global-ai-disabled", 503]] as const) {
      state.redeemResult = reason;
      const result = await handlePaidAiRedeem(post({ inviteCode: "bad" }), runtime);
      expect(result.status).toBe(status);
      expect(result.headers.get("set-cookie")).toBeNull();
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await result.json())).not.toContain("secret");
    }
    expect((await handlePaidAiRedeem(post({ inviteCode: "bad" }), undefined)).status).toBe(503);
    expect(await (await handlePaidAiStatus(new Request("https://example.com"), runtime)).json()).toEqual({ status: "access-required" });
    state.enabled = false;
    expect(await (await handlePaidAiStatus(new Request("https://example.com"), runtime)).json()).toEqual({ status: "temporarily-unavailable" });
    runtime.store.redeemInvite = async () => { throw new RedisUnavailableError(); };
    const unavailable = await handlePaidAiRedeem(post({ inviteCode: "bad" }), runtime);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("set-cookie")).toBeNull();
    expect(JSON.stringify(await unavailable.json())).not.toContain("Redis");
  });

  it("clears the production cookie even when Redis configuration is unavailable", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const result = handlePaidAiLogout(new Request("https://example.com", { method: "POST", headers: { origin: "https://example.com" } }), undefined);
      expect(result.headers.get("set-cookie")).toBe("__Host-architekt-ai-session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict; Secure");
    } finally { if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous; }
  });
});
