import { vi } from "vitest";
import type { PaidAiRuntime } from "../../../server/paid-ai/runtime";

export function paidRouteTestRuntime() {
  const status = vi.fn().mockImplementation(async (credential?: string) => credential ? "enabled" : "access-required");
  const admitPaidAiRequest = vi.fn().mockImplementation(async ({ workload }: { workload: string }) => ({ ok: true,
    reservation: { id: "test-reservation", grantId: "test-grant", workload, units: workload === "review" ? 8 : workload === "generate" ? 2 : 1, expiresInSeconds: 120 } }));
  const settleReservation = vi.fn().mockResolvedValue(undefined);
  const runtime = { deployment: "development", localClientIp: "203.0.113.10",
    access: { status, admitPaidAiRequest, settleReservation } } as unknown as PaidAiRuntime;
  return { runtime, status, admitPaidAiRequest, settleReservation };
}

export function paidRouteTestRequest(url: string, init: RequestInit, defaultContentType: string): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", "http://localhost");
  if (!headers.has("cookie")) headers.set("cookie", "architekt-ai-session=test-session");
  if (!headers.has("content-type")) headers.set("content-type", defaultContentType);
  return new Request(url, { ...init, headers });
}
