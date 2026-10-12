export const paidAiDenialMessages = {
  "access-required": "Enable AI access with a demo code.",
  "invalid-or-expired-access": "Enable AI access with a demo code.",
  "revoked-access": "Enable AI access with a demo code.",
  "grant-allowance-exhausted": "Your demo AI allowance has been used.",
  "rate-limited": "Another AI request is running, or requests are arriving too quickly. Try again shortly.",
  "concurrency-limited": "Another AI request is running, or requests are arriving too quickly. Try again shortly.",
  "global-ai-disabled": "AI features are temporarily unavailable.",
  "global-budget-exhausted": "AI features are temporarily unavailable.",
  "admission-store-unavailable": "AI features are temporarily unavailable.",
  "invalid-admission-state": "AI features are temporarily unavailable.",
  "unexpected-admission-failure": "AI features are temporarily unavailable.",
} as const;

export type PaidAiClientDenial = keyof typeof paidAiDenialMessages;
export const paidAiDenialEvent = "architekt:paid-ai-denial";

export function reportPaidAiDenial(body: unknown): void {
  if (typeof window === "undefined" || !body || typeof body !== "object" || !("error" in body)) return;
  const error = body.error;
  if (!error || typeof error !== "object" || !("type" in error) || typeof error.type !== "string" ||
    !Object.hasOwn(paidAiDenialMessages, error.type)) return;
  window.dispatchEvent(new CustomEvent<PaidAiClientDenial>(paidAiDenialEvent, { detail: error.type as PaidAiClientDenial }));
}
