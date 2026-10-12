import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { handleArchitectureGenerationPost } from "../architecture-generation-http";
import { handleArchitectureTranscriptionPost } from "../architecture-transcription-http";
import { handleArchitectureReviewPost } from "../architecture-review-http";
import type { PaidAiRuntime } from "./runtime.ts";
import type { PaidAiWorkload } from "./policy.ts";

const origin = "http://localhost";
const cookie = "architekt-ai-session=test-credential";
const headers = (contentType: string) => ({ origin, cookie, "content-type": contentType });
const generationRequest = () => new Request(`${origin}/api/architecture/generate`, { method: "POST",
  headers: headers("application/json"), body: JSON.stringify({ prompt: "A service" }) });
const voiceRequest = () => new Request(`${origin}/api/architecture/transcribe`, { method: "POST",
  headers: headers("audio/webm"), body: Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 1) });
const reviewRequest = () => new Request(`${origin}/api/architecture/review`, { method: "POST",
  headers: headers("application/json"), body: JSON.stringify({ version: 1, graph: {
    components: [{ id: "api", name: "API", kind: "service" }], connections: [], boundaries: [],
  }, designContext: { title: "", requirementsAndConstraints: "", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "" } }) });

function runtimeWithSharedBudget() {
  const state = { used: 0, concurrent: 0, workloads: [] as PaidAiWorkload[] };
  const admitPaidAiRequest = vi.fn(async ({ workload }: { workload: PaidAiWorkload }) => {
    state.workloads.push(workload);
    if (state.concurrent >= 1) return { ok: false as const, reason: "concurrency-limited" as const };
    const units = workload === "review" ? 8 : workload === "generate" ? 2 : 1;
    if (state.used + units > 12) return { ok: false as const, reason: "grant-allowance-exhausted" as const };
    state.used += units; state.concurrent++;
    return { ok: true as const, reservation: { id: String(state.used), grantId: "same-grant", workload, units, expiresInSeconds: 120 } };
  });
  const settleReservation = vi.fn(async (_reservation: unknown, completion: "known" | "ambiguous") => {
    if (completion === "known") state.concurrent--;
  });
  const runtime = { deployment: "development", localClientIp: "203.0.113.10",
    access: { status: async () => "enabled", admitPaidAiRequest, settleReservation } } as unknown as PaidAiRuntime;
  return { runtime, state, admitPaidAiRequest, settleReservation };
}

describe("three paid routes share one central admission", () => {
  it("charges 1/2/8 workload units to the same allowance and denies before constructing a provider", async () => {
    const fixture = runtimeWithSharedBudget();
    const createVoice = vi.fn(() => ({ transcribe: async () => ({ ok: false as const, type: "provider-unavailable" as const }) }));
    const createGeneration = vi.fn(() => ({ generate: async () => ({ ok: false as const, type: "generation-refused" as const }) }));
    const createReview = vi.fn(() => ({ review: async () => ({ ok: false as const, type: "provider-refused" as const }) }));
    expect((await handleArchitectureTranscriptionPost(voiceRequest(), createVoice, fixture.runtime, origin)).status).toBe(503);
    expect((await handleArchitectureGenerationPost(generationRequest(), createGeneration, fixture.runtime, origin)).status).toBe(422);
    expect((await handleArchitectureReviewPost(reviewRequest(), createReview, fixture.runtime, origin)).status).toBe(422);
    expect((await handleArchitectureTranscriptionPost(voiceRequest(), createVoice, fixture.runtime, origin)).status).toBe(503);
    expect(fixture.state.used).toBe(12);
    expect(fixture.state.workloads).toEqual(["transcription", "generate", "review", "transcription"]);
    expect((await handleArchitectureGenerationPost(generationRequest(), createGeneration, fixture.runtime, origin)).status).toBe(429);
    expect(createGeneration).toHaveBeenCalledTimes(1);
    expect(createVoice).toHaveBeenCalledTimes(2);
    expect(createReview).toHaveBeenCalledTimes(1);
    expect(fixture.state.concurrent).toBe(0);
    expect(fixture.settleReservation).toHaveBeenCalledTimes(4);
  });

  it("a generation request holding the shared slot prevents transcription provider construction", async () => {
    const fixture = runtimeWithSharedBudget();
    let finish!: (value: { ok: false; type: "generation-refused" }) => void;
    const generate = vi.fn(() => new Promise<{ ok: false; type: "generation-refused" }>((resolve) => { finish = resolve; }));
    const createVoice = vi.fn(() => ({ transcribe: async () => ({ ok: true as const, output: "should not run" }) }));
    const pending = handleArchitectureGenerationPost(generationRequest(), () => ({ generate }), fixture.runtime, origin);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect((await handleArchitectureTranscriptionPost(voiceRequest(), createVoice, fixture.runtime, origin)).status).toBe(429);
    expect(createVoice).not.toHaveBeenCalled();
    finish({ ok: false, type: "generation-refused" });
    expect((await pending).status).toBe(422);
    expect(fixture.state.concurrent).toBe(0);
    expect(fixture.state.used).toBe(2);
  });
});
