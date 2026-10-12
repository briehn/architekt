export type PaidAiWorkload = "generate" | "transcription" | "review";

export type PaidAiDenial =
  | "access-required"
  | "invalid-or-expired-access"
  | "revoked-access"
  | "rate-limited"
  | "grant-allowance-exhausted"
  | "concurrency-limited"
  | "global-ai-disabled"
  | "global-budget-exhausted"
  | "admission-store-unavailable"
  | "invalid-admission-state"
  | "unexpected-admission-failure";

export type PaidAiPolicy = Readonly<{
  inviteLifetimeSeconds: number;
  sessionLifetimeSeconds: number;
  grantConcurrent: number;
  globalConcurrent: number;
  grantAdmissionsPerMinute: number;
  globalAdmissionsPerMinute: number;
  paidAdmissionsWindowSeconds: number;
  grantUnits: number;
  globalUnitsPerUtcDay: number;
  inviteAttemptsPerIp: number;
  inviteAttemptsPerIpWindowSeconds: number;
  inviteAttemptsGlobal: number;
  inviteAttemptsGlobalWindowSeconds: number;
  paidAttemptsPerIp: number;
  paidAttemptsPerIpWindowSeconds: number;
  reservationLifetimeSeconds: number;
  generateUnits: number;
  transcriptionUnits: number;
  reviewUnits: number;
}>;

export const DEFAULT_PAID_AI_POLICY: PaidAiPolicy = Object.freeze({
  inviteLifetimeSeconds: 24 * 60 * 60,
  sessionLifetimeSeconds: 4 * 60 * 60,
  grantConcurrent: 1,
  globalConcurrent: 2,
  grantAdmissionsPerMinute: 4,
  globalAdmissionsPerMinute: 12,
  paidAdmissionsWindowSeconds: 60,
  grantUnits: 24,
  globalUnitsPerUtcDay: 120,
  inviteAttemptsPerIp: 5,
  inviteAttemptsPerIpWindowSeconds: 15 * 60,
  inviteAttemptsGlobal: 100,
  inviteAttemptsGlobalWindowSeconds: 60 * 60,
  paidAttemptsPerIp: 30,
  paidAttemptsPerIpWindowSeconds: 60,
  reservationLifetimeSeconds: 120,
  generateUnits: 2,
  transcriptionUnits: 1,
  reviewUnits: 8,
});

export function paidAiWorkloadUnits(policy: PaidAiPolicy, workload: PaidAiWorkload): number {
  return workload === "generate" ? policy.generateUnits : workload === "transcription" ? policy.transcriptionUnits : policy.reviewUnits;
}

export function parsePaidAiPolicyOverride(raw: string | undefined): PaidAiPolicy | undefined {
  if (!raw) return DEFAULT_PAID_AI_POLICY;
  try {
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const entries = Object.entries(input);
    if (entries.some(([key, value]) => !Object.hasOwn(DEFAULT_PAID_AI_POLICY, key) ||
      !Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 31_536_000)) return;
    const policy = { ...DEFAULT_PAID_AI_POLICY, ...input } as PaidAiPolicy;
    if (Math.max(policy.generateUnits, policy.transcriptionUnits, policy.reviewUnits) > policy.grantUnits ||
      policy.grantUnits > policy.globalUnitsPerUtcDay || policy.reservationLifetimeSeconds > policy.sessionLifetimeSeconds) return;
    return Object.freeze(policy);
  } catch { return; }
}
