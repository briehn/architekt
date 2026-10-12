import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createPaidAiAccess } from "./access.ts";
import { DEFAULT_PAID_AI_POLICY, type PaidAiPolicy } from "./policy.ts";
import { createPaidAiRedisStore, createUpstashRedisExecutor } from "./redis-store.ts";

const url = process.env.ARCHITEKT_TEST_REDIS_REST_URL;
const token = process.env.ARCHITEKT_TEST_REDIS_REST_TOKEN;
const realRedis = describe.runIf(Boolean(url && token));

realRedis("atomic paid-AI transitions on isolated real Redis", () => {
  const executor = createUpstashRedisExecutor(url ?? "https://unused.invalid", token ?? "unused");
  const namespaces: string[] = [];
  afterAll(async () => {
    for (const namespace of namespaces) {
      await executor.eval("local keys=redis.call('KEYS',ARGV[1]); if #keys>0 then return redis.call('DEL',unpack(keys)) end return 0", [],
        [`${namespace}:paid-ai:v1:*`]);
    }
  });
  const make = (overrides: Partial<PaidAiPolicy> = {}) => {
    const namespace = `architekt-test-${randomBytes(8).toString("hex")}`;
    namespaces.push(namespace);
    const policy = { ...DEFAULT_PAID_AI_POLICY, ...overrides };
    const store = createPaidAiRedisStore(executor, namespace);
    const access = createPaidAiAccess({ store, policy, credentialSecret: "a".repeat(64), ipSecret: "b".repeat(64) });
    return { namespace, policy, store, access };
  };
  const activate = async (fixture: ReturnType<typeof make>) => {
    await fixture.store.setEnabled(true);
    const issued = await fixture.access.issueInvite();
    const redeemed = await fixture.access.redeemInvite(issued.inviteCode, "203.0.113.9");
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) throw Error("Expected test access");
    return { issued, sessionCredential: redeemed.sessionCredential };
  };

  it("allows exactly one simultaneous redemption and rejects consumed, revoked, and expired invites", async () => {
    const fixture = make({ inviteLifetimeSeconds: 2 });
    await fixture.store.setEnabled(true);
    const issued = await fixture.access.issueInvite();
    const [first, second] = await Promise.all([
      fixture.access.redeemInvite(issued.inviteCode, "203.0.113.9"),
      fixture.access.redeemInvite(issued.inviteCode, "203.0.113.9"),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect((await fixture.access.redeemInvite(issued.inviteCode, "203.0.113.9")).ok).toBe(false);
    const revoked = await fixture.access.issueInvite();
    expect(await fixture.store.revoke("invite", revoked.inviteId)).toBe("revoked");
    expect(await fixture.access.redeemInvite(revoked.inviteCode, "203.0.113.9")).toEqual({ ok: false, reason: "revoked-access" });
    const expiring = await fixture.access.issueInvite();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(await fixture.access.redeemInvite(expiring.inviteCode, "203.0.113.9")).toEqual({ ok: false, reason: "invalid-or-expired-access" });
  }, 15_000);

  it("atomically enforces grant concurrency and preserves charged units after release", async () => {
    const fixture = make({ grantAdmissionsPerMinute: 20, globalAdmissionsPerMinute: 30 });
    const { issued, sessionCredential } = await activate(fixture);
    const attempt = () => fixture.access.admitPaidAiRequest({ sessionCredential, trustedClientIp: "203.0.113.9", workload: "review" });
    const [first, second] = await Promise.all([attempt(), attempt()]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const approved = first.ok ? first : second;
    const denied = first.ok ? second : first;
    if (!approved.ok || denied.ok) throw Error("Expected exactly one reservation");
    expect(denied.reason).toBe("concurrency-limited");
    await fixture.access.settleReservation(approved.reservation, "ambiguous");
    expect(await attempt()).toEqual({ ok: false, reason: "concurrency-limited" });
    await fixture.access.settleReservation(approved.reservation, "known");
    await fixture.access.settleReservation(approved.reservation, "known");
    const next = await attempt();
    expect(next.ok).toBe(true);
    expect((await fixture.store.operatorStatus("grant", issued.inviteId))[3]).toBe("16");
  }, 15_000);

  it("enforces global concurrency across grants and recovers an expired reservation", async () => {
    const fixture = make({ reservationLifetimeSeconds: 1, grantAdmissionsPerMinute: 20, globalAdmissionsPerMinute: 30 });
    const one = await activate(fixture);
    const two = await activate(fixture);
    const three = await activate(fixture);
    const admit = (credential: string) => fixture.access.admitPaidAiRequest({ sessionCredential: credential, trustedClientIp: "203.0.113.9", workload: "generate" });
    const [a, b, c] = await Promise.all([admit(one.sessionCredential), admit(two.sessionCredential), admit(three.sessionCredential)]);
    expect([a, b, c].filter((result) => result.ok)).toHaveLength(2);
    expect([a, b, c].filter((result) => !result.ok).map((result) => result.ok ? "" : result.reason)).toEqual(["concurrency-limited"]);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await admit(three.sessionCredential)).ok).toBe(true);
  }, 15_000);

  it("atomically enforces rolling grant rate, grant allowance, and global daily allowance", async () => {
    const rate = make({ grantAdmissionsPerMinute: 1, globalAdmissionsPerMinute: 10,
      paidAdmissionsWindowSeconds: 1, grantConcurrent: 10, globalConcurrent: 10 });
    const session = (await activate(rate)).sessionCredential;
    const request = () => rate.access.admitPaidAiRequest({ sessionCredential: session, trustedClientIp: "203.0.113.9", workload: "generate" });
    const [a, b] = await Promise.all([request(), request()]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(a.ok ? b : a).toEqual({ ok: false, reason: "rate-limited" });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await request()).ok).toBe(true);

    const grant = make({ grantUnits: 8, globalUnitsPerUtcDay: 16, grantConcurrent: 10, globalConcurrent: 10,
      grantAdmissionsPerMinute: 10, globalAdmissionsPerMinute: 10 });
    const grantSession = (await activate(grant)).sessionCredential;
    const grantAttempt = () => grant.access.admitPaidAiRequest({ sessionCredential: grantSession, trustedClientIp: "203.0.113.9", workload: "review" });
    const [g1, g2] = await Promise.all([grantAttempt(), grantAttempt()]);
    expect([g1.ok, g2.ok].sort()).toEqual([false, true]);
    expect(g1.ok ? g2 : g1).toEqual({ ok: false, reason: "grant-allowance-exhausted" });

    const global = make({ grantUnits: 8, globalUnitsPerUtcDay: 8, grantConcurrent: 10, globalConcurrent: 10,
      grantAdmissionsPerMinute: 10, globalAdmissionsPerMinute: 10 });
    const left = await activate(global); const right = await activate(global);
    const [d1, d2] = await Promise.all([left, right].map((entry) => global.access.admitPaidAiRequest({
      sessionCredential: entry.sessionCredential, trustedClientIp: "203.0.113.9", workload: "review" })));
    expect([d1.ok, d2.ok].sort()).toEqual([false, true]);
    expect(d1.ok ? d2 : d1).toEqual({ ok: false, reason: "global-budget-exhausted" });
  }, 25_000);

  it("enforces the global rolling admission limit across separate grants", async () => {
    const fixture = make({ grantAdmissionsPerMinute: 10, globalAdmissionsPerMinute: 1,
      grantConcurrent: 10, globalConcurrent: 10 });
    const left = await activate(fixture); const right = await activate(fixture);
    const [first, second] = await Promise.all([left, right].map((entry) => fixture.access.admitPaidAiRequest({
      sessionCredential: entry.sessionCredential, trustedClientIp: "203.0.113.9", workload: "generate" })));
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect(first.ok ? second : first).toEqual({ ok: false, reason: "rate-limited" });
  }, 15_000);

  it("fails closed on missing/malformed switch and revoked grants", async () => {
    const fixture = make();
    const { issued, sessionCredential } = await activate(fixture);
    const request = () => fixture.access.admitPaidAiRequest({ sessionCredential, trustedClientIp: "203.0.113.9", workload: "generate" });
    await fixture.store.setEnabled(false);
    expect(await request()).toEqual({ ok: false, reason: "global-ai-disabled" });
    const switchKey = `${fixture.namespace}:paid-ai:v1:switch`;
    await executor.eval("return redis.call('DEL', KEYS[1])", [switchKey], []);
    expect(await request()).toEqual({ ok: false, reason: "invalid-admission-state" });
    await executor.eval("return redis.call('SET', KEYS[1], 'bogus')", [switchKey], []);
    expect(await request()).toEqual({ ok: false, reason: "invalid-admission-state" });
    await fixture.store.setEnabled(true);
    await fixture.store.revoke("grant", issued.inviteId);
    expect(await request()).toEqual({ ok: false, reason: "revoked-access" });
    expect(await fixture.access.status(sessionCredential)).toBe("revoked");
  }, 15_000);

  it("rejects malformed grant usage before any charge", async () => {
    const fixture = make();
    const { issued, sessionCredential } = await activate(fixture);
    const grantKey = `${fixture.namespace}:paid-ai:v1:grant:${issued.inviteId}`;
    await executor.eval("return redis.call('HSET', KEYS[1], 'used', 'not-a-number')", [grantKey], []);
    expect(await fixture.access.admitPaidAiRequest({ sessionCredential, trustedClientIp: "203.0.113.9", workload: "generate" })).toEqual({ ok: false, reason: "invalid-admission-state" });
    expect((await fixture.store.operatorStatus("grant", issued.inviteId))[3]).toBe("not-a-number");
  }, 15_000);

  it("bounds invite and paid-route attempts and restores rolling access after expiry", async () => {
    const fixture = make({ inviteAttemptsPerIp: 2, inviteAttemptsGlobal: 3,
      inviteAttemptsPerIpWindowSeconds: 1, inviteAttemptsGlobalWindowSeconds: 1,
      paidAttemptsPerIp: 2, paidAttemptsPerIpWindowSeconds: 1 });
    await fixture.store.setEnabled(true);
    expect(await fixture.access.redeemInvite("malformed", "203.0.113.9")).toEqual({ ok: false, reason: "invalid-or-expired-access" });
    expect(await fixture.access.redeemInvite("malformed", "203.0.113.9")).toEqual({ ok: false, reason: "invalid-or-expired-access" });
    expect(await fixture.access.redeemInvite("malformed", "203.0.113.9")).toEqual({ ok: false, reason: "rate-limited" });
    expect(await fixture.access.redeemInvite("malformed", "203.0.113.10")).toEqual({ ok: false, reason: "invalid-or-expired-access" });
    expect(await fixture.access.redeemInvite("malformed", "203.0.113.11")).toEqual({ ok: false, reason: "rate-limited" });
    const paidAttempt = () => fixture.access.admitPaidAiRequest({ trustedClientIp: "203.0.113.9", workload: "generate" });
    expect(await paidAttempt()).toEqual({ ok: false, reason: "access-required" });
    expect(await paidAttempt()).toEqual({ ok: false, reason: "access-required" });
    expect(await paidAttempt()).toEqual({ ok: false, reason: "rate-limited" });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await paidAttempt()).toEqual({ ok: false, reason: "access-required" });
  }, 15_000);

  it("expires sessions and ignores yesterday's UTC-day usage key", async () => {
    const expired = make({ sessionLifetimeSeconds: 1, reservationLifetimeSeconds: 1 });
    const { issued, sessionCredential } = await activate(expired);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await expired.access.status(sessionCredential)).toBe("expired");
    expect((await expired.store.operatorStatus("grant", issued.inviteId))[0]).toBe("expired");
    expect(await expired.access.admitPaidAiRequest({ sessionCredential, trustedClientIp: "203.0.113.9", workload: "generate" })).toEqual({ ok: false, reason: "invalid-or-expired-access" });

    const current = make();
    const live = (await activate(current)).sessionCredential;
    const yesterdayKey = `${current.namespace}:paid-ai:v1:day:`;
    await executor.eval("local t=redis.call('TIME'); local d=math.floor(tonumber(t[1])/86400)-1; return redis.call('SET', ARGV[1]..d, '999')", [], [yesterdayKey]);
    expect((await current.access.admitPaidAiRequest({ sessionCredential: live, trustedClientIp: "203.0.113.9", workload: "generate" })).ok).toBe(true);
  }, 15_000);
});
