import { randomIdentifier } from "./credentials.ts";
import { paidAiWorkloadUnits, type PaidAiDenial, type PaidAiPolicy, type PaidAiWorkload } from "./policy.ts";
import { ACCESS_STATUS_SCRIPT, ADMIT_SCRIPT, ISSUE_INVITE_SCRIPT, LOOKUP_SESSION_SCRIPT,
  OPERATOR_STATUS_SCRIPT, RATE_ATTEMPT_SCRIPT, REDEEM_INVITE_SCRIPT, RELEASE_SCRIPT,
  REVOKE_SCRIPT, SET_SWITCH_SCRIPT } from "./redis-scripts.ts";

export class RedisUnavailableError extends Error { constructor() { super("Redis unavailable"); } }
export class RedisStateError extends Error { constructor() { super("Invalid Redis state"); } }

export interface RedisScriptExecutor {
  eval(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown>;
}

/** Upstash REST EVAL: one HTTP call per atomic transition, with no retry after ambiguity. */
export function createUpstashRedisExecutor(url: string, token: string, fetcher: typeof fetch = fetch): RedisScriptExecutor {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !token) throw new RedisStateError();
  return {
    async eval(script, keys, args) {
      let response: Response;
      try {
        response = await fetcher(endpoint.href, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(["EVAL", script, keys.length, ...keys, ...args]),
          signal: AbortSignal.timeout(2_000),
          cache: "no-store",
          redirect: "error",
        });
      } catch { throw new RedisUnavailableError(); }
      if (!response.ok) throw new RedisUnavailableError();
      let raw: string;
      try { raw = await response.text(); } catch { throw new RedisUnavailableError(); }
      let body: unknown;
      try {
        if (raw.length > 16_384) throw new RedisStateError();
        body = JSON.parse(raw) as unknown;
      } catch { throw new RedisStateError(); }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
        Reflect.ownKeys(body).length !== 1 || !Object.hasOwn(body, "result")) throw new RedisStateError();
      return (body as { result: unknown }).result;
    },
  };
}

export type PaidAiReservation = Readonly<{
  id: string;
  grantId: string;
  workload: PaidAiWorkload;
  units: number;
  expiresInSeconds: number;
}>;

export interface PaidAiStore {
  issueInvite(input: { id: string; hash: string; grantId: string; ttlSeconds: number }): Promise<"issued" | "collision">;
  redeemInvite(input: { id: string; hash: string; grantId: string; sessionHash: string; ipHash: string; policy: PaidAiPolicy }): Promise<string>;
  lookupSession(sessionHash: string): Promise<string | undefined>;
  accessStatus(sessionHash: string, grantId: string): Promise<string>;
  recordPaidAttempt(ipHash: string, policy: PaidAiPolicy): Promise<string>;
  admit(input: { sessionHash: string; grantId: string; workload: PaidAiWorkload; policy: PaidAiPolicy }): Promise<{ status: string; reservation?: PaidAiReservation }>;
  release(reservation: PaidAiReservation): Promise<"released" | "already-released">;
  setEnabled(enabled: boolean): Promise<void>;
  operatorStatus(kind: "switch" | "invite" | "grant", id?: string): Promise<readonly string[]>;
  revoke(kind: "invite" | "grant", id: string): Promise<"revoked" | "not-found">;
}

const denialValues: readonly string[] = [
  "invalid-or-expired-access", "revoked-access", "rate-limited", "grant-allowance-exhausted",
  "concurrency-limited", "global-ai-disabled", "global-budget-exhausted", "invalid-admission-state",
] satisfies readonly PaidAiDenial[];

function expected(value: unknown, allowed: readonly string[]): string {
  if (typeof value !== "string" || !allowed.includes(value)) throw new RedisStateError();
  return value;
}

export function createPaidAiRedisStore(executor: RedisScriptExecutor, namespace: string): PaidAiStore {
  const prefix = `${namespace}:paid-ai:v1`;
  const key = (kind: string, id?: string) => `${prefix}:${kind}${id ? `:${id}` : ""}`;
  return {
    async issueInvite({ id, hash, grantId, ttlSeconds }) {
      return expected(await executor.eval(ISSUE_INVITE_SCRIPT, [key("invite", id)], [hash, grantId, String(ttlSeconds)]), ["issued", "collision"]) as "issued" | "collision";
    },
    async redeemInvite({ id, hash, grantId, sessionHash, ipHash, policy }) {
      return expected(await executor.eval(REDEEM_INVITE_SCRIPT,
        [key("switch"), key("invite", id), key("grant", grantId), key("session", sessionHash),
          key("invite-ip", ipHash), key("invite-global")],
        [hash, grantId, String(policy.inviteAttemptsPerIp), String(policy.inviteAttemptsPerIpWindowSeconds * 1000),
          String(policy.inviteAttemptsGlobal), String(policy.inviteAttemptsGlobalWindowSeconds * 1000),
          String(policy.sessionLifetimeSeconds), randomIdentifier()]),
      ["enabled", "rate-limited", "global-ai-disabled", "invalid-or-expired-access", "revoked-access", "invalid-admission-state"]);
    },
    async lookupSession(sessionHash) {
      const result = await executor.eval(LOOKUP_SESSION_SCRIPT, [key("session", sessionHash)], []);
      if (result === "missing") return;
      if (result === "invalid-admission-state") throw new RedisStateError();
      if (typeof result !== "string" || !/^[a-f0-9]{32}$/.test(result)) throw new RedisStateError();
      return result;
    },
    async accessStatus(sessionHash, grantId) {
      return expected(await executor.eval(ACCESS_STATUS_SCRIPT,
        [key("switch"), key("session", sessionHash), key("grant", grantId)], [grantId]),
      ["enabled", "global-ai-disabled", "invalid-or-expired-access", "revoked-access", "invalid-admission-state"]);
    },
    async recordPaidAttempt(ipHash, policy) {
      return expected(await executor.eval(RATE_ATTEMPT_SCRIPT, [key("paid-ip", ipHash)],
        [String(policy.paidAttemptsPerIp), String(policy.paidAttemptsPerIpWindowSeconds * 1000), randomIdentifier()]),
      ["allowed", "rate-limited", "invalid-admission-state"]);
    },
    async admit({ sessionHash, grantId, workload, policy }) {
      const id = randomIdentifier();
      const units = paidAiWorkloadUnits(policy, workload);
      const reservation: PaidAiReservation = Object.freeze({ id, grantId, workload, units, expiresInSeconds: policy.reservationLifetimeSeconds });
      const result = expected(await executor.eval(ADMIT_SCRIPT,
        [key("switch"), key("session", sessionHash), key("grant", grantId), key("rate-grant", grantId),
          key("rate-global"), key("concurrent-grant", grantId), key("concurrent-global"), key("reservation", id)],
        [grantId, String(units), String(policy.grantAdmissionsPerMinute), String(policy.globalAdmissionsPerMinute),
          String(policy.paidAdmissionsWindowSeconds * 1000), String(policy.grantUnits), String(policy.globalUnitsPerUtcDay), String(policy.grantConcurrent),
          String(policy.globalConcurrent), String(policy.reservationLifetimeSeconds), `${grantId}:${workload}:${units}`,
          prefix, id]), ["approved", ...denialValues]);
      return result === "approved" ? { status: result, reservation } : { status: result };
    },
    async release(reservation) {
      return expected(await executor.eval(RELEASE_SCRIPT,
        [key("reservation", reservation.id), key("concurrent-grant", reservation.grantId), key("concurrent-global")],
        [`${reservation.grantId}:${reservation.workload}:${reservation.units}`, reservation.id]),
      ["released", "already-released"]) as "released" | "already-released";
    },
    async setEnabled(enabled) {
      expected(await executor.eval(SET_SWITCH_SCRIPT, [key("switch")], [enabled ? "enabled" : "disabled"]), [enabled ? "enabled" : "disabled"]);
    },
    async operatorStatus(kind, id) {
      const result = await executor.eval(OPERATOR_STATUS_SCRIPT, [key(kind, id)], []);
      if (!Array.isArray(result) || result.some((item) => typeof item !== "string") || result.length < 1 || result.length > 4) throw new RedisStateError();
      return result as string[];
    },
    async revoke(kind, id) {
      return expected(await executor.eval(REVOKE_SCRIPT, [key(kind, id)], []),
        ["revoked", "not-found"]) as "revoked" | "not-found";
    },
  };
}
