import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../server/openai-architecture-review-provider", () => ({ createOpenAIArchitectureReviewProvider: vi.fn() }));

import { POST } from "./route";
import { createOpenAIArchitectureReviewProvider } from "../../../../server/openai-architecture-review-provider";
import { ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES, ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS } from "../../../../server/architecture-review-config";
import { reviewFailure, type ArchitectureReviewProviderResult } from "../../../../application/architecture-review/architecture-review";
import { boundedReviewSuccessResponse } from "../../../../server/architecture-review-http";
import type { ComponentId } from "../../../../domain/identifiers";

const factory = vi.mocked(createOpenAIArchitectureReviewProvider);
const raw = {
  modeledFacts: [{ type: "modeled-fact", evidence: "C1" }, { type: "modeled-fact", evidence: "F1" }],
  statedContext: [{ type: "stated-context", evidence: "D2", excerpt: "Store orders." }],
  tradeoffs: [{ type: "tradeoff", condition: "traffic grows", benefit: "a cache may reduce repeated reads", downside: "invalidation becomes necessary", evidence: ["C2", "D2"] }],
  questions: [{ type: "question", question: "What is the peak workload?", evidence: ["D3"] }],
};
function document() {
  return {
    version: 1,
    graph: {
      components: [
        { id: "client", name: "Browser", kind: "client" },
        { id: "db", name: "Database", kind: "database" },
      ],
      connections: [{ id: "direct", sourceComponentId: "client", targetComponentId: "db", kind: "data-access" }],
      boundaries: [{ id: "area", name: "Data", memberComponentIds: ["db"] }, { id: "empty", name: "Future", memberComponentIds: [] }],
    },
    designContext: { title: "Orders", requirementsAndConstraints: "Store orders.", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "" },
  };
}
function request(body: unknown = document(), headers: Record<string, string> = {}, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/architecture/review", {
    method: "POST", body: JSON.stringify(body), signal,
    headers: { "content-type": "application/json", ...headers },
  });
}
function configure(result: ArchitectureReviewProviderResult = { ok: true, output: raw }) {
  vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
  vi.stubEnv("ARCHITEKT_OPENAI_REVIEW_MODEL", "");
  const review = vi.fn().mockResolvedValue(result);
  factory.mockReturnValue({ review });
  return review;
}
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("POST /api/architecture/review", () => {
  it("accepts same-origin JSON and returns only resolved, deterministic review content", async () => {
    const review = configure();
    const response = await POST(request(document(), { origin: "http://localhost", "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.review.modeledFacts[0]).toEqual({ evidence: { type: "component", id: "client" }, text: "Browser is modeled as a Client." });
    expect(body.review.modeledFacts[1].evidence.type).toBe("analysis-finding");
    expect(body.review.statedContext[0]).toEqual({ evidence: { type: "design-context", field: "requirementsAndConstraints" }, excerpt: "Store orders." });
    expect(JSON.stringify(body)).not.toContain('"alias"');
    expect(review).toHaveBeenCalledOnce();
    const catalog = review.mock.calls[0][0];
    expect(catalog.entries.some((entry: { category: string; details?: { ruleId?: string } }) => entry.category === "analysis-finding" && entry.details?.ruleId === "client-database-connection")).toBe(true);
    expect(catalog.entries.some((entry: { category: string; alias: string }) => entry.category === "boundary" && entry.alias === "B2")).toBe(true);
    expect(factory).toHaveBeenCalledExactlyOnceWith({ apiKey: "test-only-placeholder", model: "gpt-6-luna" });
  });

  it("never accepts client Analysis, catalog, positions, or other editor state", async () => {
    configure();
    for (const body of [
      { ...document(), analysis: { findings: [] } },
      { ...document(), evidenceCatalog: { entries: [] } },
      { ...document(), graph: { ...document().graph, positions: {} } },
      { ...document(), voice: "transcript" },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: reviewFailure("invalid-request") });
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects empty, invalid topology and review-only count limits before provider construction", async () => {
    configure();
    const empty = document();
    empty.graph.components = [];
    empty.graph.connections = [];
    empty.graph.boundaries = [];
    expect((await POST(request(empty))).status).toBe(422);
    const invalid = document();
    invalid.graph.connections[0].targetComponentId = "missing";
    expect((await POST(request(invalid))).status).toBe(400);
    const oversized = document();
    oversized.graph.components = Array.from({ length: 101 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, kind: "client" }));
    expect((await POST(request(oversized))).status).toBe(413);
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    ["not json", "application/octet-stream"],
    ["{broken", "application/json"],
    ["", "application/json"],
    ["{}", "application/json"],
  ] as const)("rejects malformed content/body %#", async (body, contentType) => {
    configure();
    const response = await POST(new Request("http://localhost/api/architecture/review", { method: "POST", body, headers: { "content-type": contentType } }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 before parsing or provider construction", async () => {
    configure();
    const response = await POST(new Request("http://localhost/api/architecture/review", {
      method: "POST", body: Uint8Array.of(0xff, 0xfe), headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });

  it("enforces actual UTF-8 body bytes independently of Content-Length", async () => {
    configure();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); }, cancel });
    const req = new Request("http://localhost/api/architecture/review", {
      method: "POST", body: stream, headers: { "content-type": "application/json", "content-length": "1" }, duplex: "half",
    } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    const declared = new Request("http://localhost/api/architecture/review", {
      method: "POST", body: "{}", headers: { "content-type": "application/json", "content-length": String(ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES + 1) },
    });
    expect((await POST(declared)).status).toBe(413);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects expanded review input even when the raw document fits the HTTP byte limit", async () => {
    configure();
    const large = document();
    large.graph.components = Array.from({ length: 100 }, (_, i) => ({ id: `component-${String(i).padStart(3, "0")}`, name: `Service ${i} ${"n".repeat(180)}`, kind: "service" }));
    large.graph.connections = Array.from({ length: 200 }, (_, i) => ({
      id: `edge-${String(i).padStart(3, "0")}-${"e".repeat(110)}`,
      sourceComponentId: large.graph.components[i % 50].id,
      targetComponentId: large.graph.components[50 + Math.floor(i / 50)].id,
      kind: "generic",
    }));
    large.graph.boundaries = Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, name: `Boundary ${i} ${"b".repeat(175)}`, memberComponentIds: [] }));
    large.designContext.requirementsAndConstraints = "R".repeat(5000);
    large.designContext.assumptionsAndOpenQuestions = "A".repeat(5000);
    large.designContext.decisionsAndTradeoffs = "D".repeat(5000);
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeLessThan(ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES);
    const response = await POST(request(large));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { type: "review-limit-exceeded", detail: "expanded review input" } });
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests without permissive CORS", async () => {
    configure();
    for (const headers of ([{ origin: "https://other.example" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }] as Record<string, string>[])) {
      const response = await POST(request(document(), headers));
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("maps missing configuration and independent model override", async () => {
    configure();
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await (await POST(request())).json()).toEqual({ error: reviewFailure("configuration-unavailable") });
    expect(factory).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
    vi.stubEnv("ARCHITEKT_OPENAI_MODEL", "generation-only");
    vi.stubEnv("ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL", "transcription-only");
    vi.stubEnv("ARCHITEKT_OPENAI_REVIEW_MODEL", "review-only");
    expect((await POST(request())).status).toBe(200);
    expect(factory).toHaveBeenCalledWith({ apiKey: "test-only-placeholder", model: "review-only" });
  });

  it.each([
    ["review-timeout", 504], ["review-rate-limited", 429], ["provider-unavailable", 503],
    ["provider-refused", 422], ["provider-incomplete", 502], ["invalid-provider-result", 502], ["review-failed", 502],
  ] as const)("maps %s to a safe HTTP %i", async (type, status) => {
    configure({ ok: false, type });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: reviewFailure(type) });
  });

  it.each([
    ["unknown alias", { ...raw, modeledFacts: [{ type: "modeled-fact", evidence: "C99" }] }],
    ["wrong category", { ...raw, modeledFacts: [{ type: "modeled-fact", evidence: "D2" }] }],
    ["wrong excerpt", { ...raw, statedContext: [{ type: "stated-context", evidence: "D2", excerpt: "Store payments." }] }],
    ["blank excerpt", { ...raw, statedContext: [{ type: "stated-context", evidence: "D2", excerpt: " " }] }],
    ["duplicate evidence", { ...raw, questions: [{ type: "question", question: "What?", evidence: ["C1", "C1"] }] }],
    ["zero facts", { ...raw, modeledFacts: [] }],
    ["zero questions", { ...raw, questions: [] }],
    ["long question", { ...raw, questions: [{ type: "question", question: "x".repeat(301), evidence: ["D3"] }] }],
    ["raw output above 64 KiB", { ...raw, questions: [{ type: "question", question: "x".repeat(65_537), evidence: ["D3"] }] }],
    ["unexpected field", { ...raw, id: "provider-id" }],
    ["partial invalid", { ...raw, modeledFacts: [raw.modeledFacts[0], { type: "modeled-fact", evidence: "wrong" }] }],
  ] as const)("rejects complete SDK-shaped output when %s", async (_label, output) => {
    configure({ ok: true, output });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: reviewFailure("invalid-provider-result") });
  });

  it("maps unexpected internal provider errors without leaking text", async () => {
    const review = configure();
    review.mockRejectedValue(new Error("private provider body and API key"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });

  it("defensively bounds the resolved UTF-8 HTTP response without truncation", async () => {
    const synthetic = { modeledFacts: [{ evidence: { type: "component" as const, id: "c1" as ComponentId }, text: "文".repeat(90_000) }], statedContext: [], tradeoffs: [], questions: [] };
    const response = boundedReviewSuccessResponse(synthetic);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: reviewFailure("invalid-provider-result") });
  });

  it("enforces the 15-second body-read deadline", async () => {
    vi.useFakeTimers();
    configure();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request("http://localhost/api/architecture/review", { method: "POST", body: stream, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit);
    const pending = POST(req);
    await vi.advanceTimersByTimeAsync(ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS);
    expect((await pending).status).toBe(504);
    expect(cancel).toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it("does not serialize a late success after request cancellation", async () => {
    const review = configure();
    let resolve!: (value: ArchitectureReviewProviderResult) => void;
    review.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const controller = new AbortController();
    const pending = POST(request(document(), {}, controller.signal));
    await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
    controller.abort();
    expect((await pending).status).toBe(499);
    resolve({ ok: true, output: raw });
  });
});
