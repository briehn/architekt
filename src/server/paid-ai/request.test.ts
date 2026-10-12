import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedPaidAiOrigin, configuredPaidAiOrigins, paidAiDenialResponse, paidAiJsonContentType, readBoundedBody, withPaidAiReservation } from "./request.ts";
import { paidRouteTestRuntime } from "../../app/api/architecture/paid-route-test-support";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("shared paid-route transport and origin policy", () => {
  it("accepts only exact explicitly configured origins, including separately configured local host spellings", () => {
    const allowed = "https://demo.example,http://localhost:3000,http://127.0.0.1:3000";
    const request = (origin?: string, site?: string) => new Request("http://localhost:3000/api/architecture/transcribe", {
      method: "POST", headers: { ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) },
    });
    expect(allowedPaidAiOrigin(request("https://demo.example", "same-origin"), allowed)).toBe(true);
    expect(allowedPaidAiOrigin(request("http://localhost:3000"), allowed)).toBe(true);
    expect(allowedPaidAiOrigin(request("http://127.0.0.1:3000"), allowed)).toBe(true);
    for (const origin of [undefined, "null", "https://other.example", "https://demo.example.evil", "http://localhost:3001"])
      expect(allowedPaidAiOrigin(request(origin), allowed)).toBe(false);
    expect(allowedPaidAiOrigin(request("https://demo.example", "cross-site"), allowed)).toBe(false);
    expect(allowedPaidAiOrigin(request("https://demo.example"), undefined)).toBe(false);
    expect(configuredPaidAiOrigins("https://demo.example", "production")).toEqual(["https://demo.example"]);
    expect(configuredPaidAiOrigins("http://localhost:3000,http://127.0.0.1:3000", "development")).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(configuredPaidAiOrigins("http://demo.example", "production")).toBeUndefined();
    expect(configuredPaidAiOrigins("http://demo.example", "development")).toBeUndefined();
    expect(configuredPaidAiOrigins("https://demo.example/path", "production")).toBeUndefined();
  });

  it("rejects non-JSON or non-UTF-8 media types and maps denials without internal state", async () => {
    expect(paidAiJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(paidAiJsonContentType("application/json; charset=latin1")).toBe(false);
    expect(paidAiJsonContentType("text/plain")).toBe(false);
    const denied = paidAiDenialResponse("global-budget-exhausted");
    expect(denied.status).toBe(503);
    expect(JSON.stringify(await denied.json())).not.toMatch(/Redis|units|grant|reservation/i);
  });

  it("bounds actual streamed bytes, has an independent deadline, and observes caller cancellation", async () => {
    const overflow = new Request("http://localhost", { method: "POST", body: new Uint8Array(5) });
    expect(await readBoundedBody(overflow, 4)).toEqual({ ok: false, reason: "too-large" });
    vi.useFakeTimers();
    const stalled = new Request("http://localhost", { method: "POST", body: new ReadableStream<Uint8Array>(), duplex: "half" } as RequestInit);
    const pending = readBoundedBody(stalled, 4, 15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    const controller = new AbortController();
    const canceled = new Request("http://localhost", { method: "POST", body: new ReadableStream<Uint8Array>(),
      duplex: "half", signal: controller.signal } as RequestInit);
    const canceledRead = readBoundedBody(canceled, 4);
    controller.abort();
    expect(await canceledRead).toEqual({ ok: false, reason: "canceled" });
  });

  it("releases known completion and retains ambiguous in-flight cancellation", async () => {
    const fixture = paidRouteTestRuntime();
    const reservation = { id: "r", grantId: "g", workload: "generate" as const, units: 2, expiresInSeconds: 120 };
    const ordinary = new Request("http://localhost");
    expect(await withPaidAiReservation(ordinary, fixture.runtime, reservation, async () => 7)).toEqual({ canceled: false, value: 7 });
    expect(fixture.settleReservation).toHaveBeenLastCalledWith(reservation, "known");
    const controller = new AbortController();
    const request = new Request("http://localhost", { signal: controller.signal });
    let finish!: (value: number) => void;
    const running = withPaidAiReservation(request, fixture.runtime, reservation, () => new Promise<number>((resolve) => { finish = resolve; }));
    controller.abort();
    expect(await running).toEqual({ canceled: true });
    expect(fixture.settleReservation).toHaveBeenLastCalledWith(reservation, "ambiguous");
    finish(9);
    expect(fixture.settleReservation).toHaveBeenCalledTimes(2);
  });
});
