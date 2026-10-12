import { credentialHash, parseInviteCode, randomCredential, randomIdentifier, validSessionCredential } from "./credentials.ts";
import { paidAiWorkloadUnits, type PaidAiDenial, type PaidAiPolicy, type PaidAiWorkload } from "./policy.ts";
import { RedisStateError, RedisUnavailableError, type PaidAiReservation, type PaidAiStore } from "./redis-store.ts";

export type PaidAiAccessResult =
  | Readonly<{ ok: true; sessionCredential: string }>
  | Readonly<{ ok: false; reason: PaidAiDenial }>;
export type PaidAiAdmissionResult =
  | Readonly<{ ok: true; reservation: PaidAiReservation }>
  | Readonly<{ ok: false; reason: PaidAiDenial }>;
export type PaidAiAccessStatus = "enabled" | "access-required" | "expired" | "revoked" | "temporarily-unavailable";

export type PaidAiEvent = Readonly<{
  event: "invite-redemption" | "paid-admission" | "reservation-settlement";
  outcome: "approved" | "denied" | "released" | "retained";
  workload?: PaidAiWorkload;
  reason?: PaidAiDenial;
  units?: number;
  durationMs?: number;
}>;
export type PaidAiTelemetry = (event: PaidAiEvent) => void;

export type PaidAiAccessDependencies = Readonly<{
  store: PaidAiStore;
  policy: PaidAiPolicy;
  credentialSecret: string;
  ipSecret: string;
  telemetry?: PaidAiTelemetry;
}>;

function storeFailure(error: unknown): PaidAiDenial {
  if (error instanceof RedisUnavailableError) return "admission-store-unavailable";
  if (error instanceof RedisStateError) return "invalid-admission-state";
  throw error;
}

const denialReasons = new Set<PaidAiDenial>([
  "access-required", "invalid-or-expired-access", "revoked-access", "rate-limited",
  "grant-allowance-exhausted", "concurrency-limited", "global-ai-disabled",
  "global-budget-exhausted", "admission-store-unavailable", "invalid-admission-state",
  "unexpected-admission-failure",
]);

function asDenial(value: string): PaidAiDenial {
  if (!denialReasons.has(value as PaidAiDenial)) throw new RedisStateError();
  return value as PaidAiDenial;
}

export function createPaidAiAccess({ store, policy, credentialSecret, ipSecret, telemetry }: PaidAiAccessDependencies) {
  const emit = (event: PaidAiEvent) => {
    // Operational logging is best-effort and cannot turn a charged admission into an error.
    try { telemetry?.(event); } catch { /* no document or credential data is logged */ }
  };
  const sessionHash = (credential: string) => credentialHash(credentialSecret, "session", credential);
  const ipHash = (ip: string) => credentialHash(ipSecret, "ip", ip);
  return {
    /** Only an operator calls this. The plaintext credential is returned exactly once. */
    async issueInvite(): Promise<{ inviteCode: string; inviteId: string }> {
      const inviteId = randomIdentifier();
      const secret = randomCredential();
      const result = await store.issueInvite({ id: inviteId, hash: credentialHash(credentialSecret, "invite", secret),
        grantId: inviteId, ttlSeconds: policy.inviteLifetimeSeconds });
      if (result !== "issued") throw new RedisStateError();
      return { inviteCode: `${inviteId}.${secret}`, inviteId };
    },
    async redeemInvite(inviteCode: unknown, trustedClientIp: string | undefined): Promise<PaidAiAccessResult> {
      const started = Date.now();
      let outcome: PaidAiAccessResult;
      if (!trustedClientIp) outcome = { ok: false, reason: "admission-store-unavailable" };
      else {
        const parsed = parseInviteCode(inviteCode);
        // Even malformed codes enter the same atomic attempt counters.
        const id = parsed?.id ?? "00000000000000000000000000000000";
        const hash = parsed ? credentialHash(credentialSecret, "invite", parsed.credential) : "invalid";
        const sessionCredential = randomCredential();
        try {
          const result = await store.redeemInvite({ id, hash, grantId: id, sessionHash: sessionHash(sessionCredential),
            ipHash: ipHash(trustedClientIp), policy });
          outcome = result === "enabled" ? { ok: true, sessionCredential } : { ok: false, reason: asDenial(result) };
        } catch (error) { outcome = { ok: false, reason: storeFailure(error) }; }
      }
      emit({ event: "invite-redemption", outcome: outcome.ok ? "approved" : "denied",
        ...(!outcome.ok ? { reason: outcome.reason } : {}), durationMs: Date.now() - started });
      return outcome;
    },
    async status(sessionCredential: string | undefined): Promise<PaidAiAccessStatus> {
      try {
        if (!sessionCredential) {
          const switchState = await store.operatorStatus("switch");
          return switchState[0] === "enabled" ? "access-required" : "temporarily-unavailable";
        }
        if (!validSessionCredential(sessionCredential)) return "expired";
        const hash = sessionHash(sessionCredential);
        const grantId = await store.lookupSession(hash);
        if (!grantId) return "expired";
        const result = await store.accessStatus(hash, grantId);
        return result === "enabled" ? "enabled" : result === "revoked-access" ? "revoked" :
          result === "invalid-or-expired-access" ? "expired" : "temporarily-unavailable";
      } catch (error) {
        storeFailure(error);
        return "temporarily-unavailable";
      }
    },
    /** Slice 3 will call this after existing route/body validation, before provider construction. */
    async admitPaidAiRequest(input: { sessionCredential?: string; trustedClientIp?: string; workload: PaidAiWorkload }): Promise<PaidAiAdmissionResult> {
      const started = Date.now();
      let outcome: PaidAiAdmissionResult;
      try {
        if (!input.trustedClientIp) outcome = { ok: false, reason: "admission-store-unavailable" };
        else {
          const attempt = await store.recordPaidAttempt(ipHash(input.trustedClientIp), policy);
          if (attempt !== "allowed") outcome = { ok: false, reason: asDenial(attempt) };
          else if (!input.sessionCredential) outcome = { ok: false, reason: "access-required" };
          else if (!validSessionCredential(input.sessionCredential)) outcome = { ok: false, reason: "invalid-or-expired-access" };
          else {
            const hash = sessionHash(input.sessionCredential);
            const grantId = await store.lookupSession(hash);
            if (!grantId) outcome = { ok: false, reason: "invalid-or-expired-access" };
            else {
              const admission = await store.admit({ sessionHash: hash, grantId, workload: input.workload, policy });
              outcome = admission.status === "approved" && admission.reservation
                ? { ok: true, reservation: admission.reservation }
                : { ok: false, reason: asDenial(admission.status) };
            }
          }
        }
      } catch (error) { outcome = { ok: false, reason: storeFailure(error) }; }
      emit({ event: "paid-admission", outcome: outcome.ok ? "approved" : "denied", workload: input.workload,
        ...(!outcome.ok ? { reason: outcome.reason } : { units: paidAiWorkloadUnits(policy, input.workload) }),
        durationMs: Date.now() - started });
      return outcome;
    },
    /** Completion must be known. Ambiguous execution keeps the slot until Redis TTL recovery. */
    async settleReservation(reservation: PaidAiReservation, completion: "known" | "ambiguous"): Promise<void> {
      if (completion === "ambiguous") {
        emit({ event: "reservation-settlement", outcome: "retained", workload: reservation.workload, units: reservation.units });
        return;
      }
      await store.release(reservation);
      emit({ event: "reservation-settlement", outcome: "released", workload: reservation.workload, units: reservation.units });
    },
  };
}

export function logPaidAiEvent(event: PaidAiEvent): void {
  console.info(JSON.stringify({ source: "architekt-paid-ai", ...event }));
}
