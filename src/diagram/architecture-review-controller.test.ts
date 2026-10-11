import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { getArchitectureReviewSnapshotKey, prepareArchitectureReviewSnapshot } from "../application/architecture-review/review-snapshot";
import { reviewFailure, type ArchitectureReview } from "../application/architecture-review/architecture-review";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import { ArchitectureReviewController, parseArchitectureReviewResponse, requestArchitectureReview, REVIEW_CLIENT_TIMEOUT_MS, type ArchitectureReviewRequest } from "./architecture-review-controller";

const componentId = "api" as ComponentId;
const added = ArchitectureGraph.empty().addComponent({ id: componentId, name: "API", kind: "service" });
if (!added.ok) throw Error("fixture");
const graph = added.graph;
const prepared = prepareArchitectureReviewSnapshot(graph, EMPTY_DESIGN_CONTEXT);
if (!prepared.ok) throw Error("fixture");
const snapshot = prepared.snapshot;
const key = getArchitectureReviewSnapshotKey(snapshot);
const review: ArchitectureReview = {
  modeledFacts: [{ evidence: { type: "component", id: componentId }, text: "API is modeled as a Service." }],
  statedContext: [], tradeoffs: [], questions: [{ question: "What traffic is expected?", evidence: [{ type: "design-context", field: "assumptionsAndOpenQuestions" }] }],
};

function deferred() {
  const resolve: Array<(result: Awaited<ReturnType<ArchitectureReviewRequest>>) => void> = [];
  const request = vi.fn<ArchitectureReviewRequest>(() => new Promise((done) => { resolve.push(done); }));
  return { request, finish: (index: number, result: Awaited<ReturnType<ArchitectureReviewRequest>>) => resolve[index](result) };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("architecture review client", () => {
  it("sends only canonical structure and committed context on explicit request", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ version: 1, graph: { components: snapshot.components, connections: snapshot.connections, boundaries: snapshot.boundaries }, designContext: EMPTY_DESIGN_CONTEXT });
      expect(JSON.stringify(body)).not.toMatch(/position|analysis|key|selection|viewport|voice|history/i);
      return { ok: true, text: async () => JSON.stringify({ review }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestArchitectureReview(snapshot, new AbortController().signal)).toEqual(review);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/architecture/review");
  });

  it("rejects malformed success and maps server errors to application-owned copy", async () => {
    expect(parseArchitectureReviewResponse({ review: { ...review, modeledFacts: [{ evidence: { type: "component", id: "missing" }, text: "Claim" }] } }, snapshot)).toBeNull();
    expect(parseArchitectureReviewResponse({ review: { ...review, extra: true } }, snapshot)).toBeNull();
    expect(parseArchitectureReviewResponse({ review }, snapshot)).toEqual(review);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, text: async () => JSON.stringify({ error: { type: "review-rate-limited", message: "raw provider body" } }) })));
    expect(await requestArchitectureReview(snapshot, new AbortController().signal)).toEqual(reviewFailure("review-rate-limited"));
  });

  it("runs idle, loading, ready, rerun failure, cancel, stale and current-again without changing input", async () => {
    const pending = deferred();
    let current = key;
    const changes = vi.fn();
    const controller = new ArchitectureReviewController(changes, () => current, pending.request);
    const first = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    expect(controller.getState().status).toBe("loading");
    pending.finish(0, review); await first;
    expect(controller.getState()).toMatchObject({ status: "ready", completed: { review, key } });
    const second = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    pending.finish(1, reviewFailure("provider-unavailable")); await second;
    expect(controller.getState()).toMatchObject({ status: "error", completed: { review }, error: { type: "provider-unavailable" } });
    const third = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    const signal = pending.request.mock.calls[2][1];
    controller.cancel(); await third;
    expect(signal.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ status: "ready", completed: { review } });
    current = "renamed"; controller.onCanonicalChange(current);
    expect(controller.getState().completed?.key !== current).toBe(true);
    current = key; controller.onCanonicalChange(current);
    expect(controller.getState().completed?.key).toBe(current);
    controller.discard();
    expect(controller.getState()).toEqual({ status: "idle", completed: null });
    expect(graph.getComponents()).toEqual([{ id: componentId, name: "API", kind: "service" }]);
  });

  it("ignores late responses after canonical change, replacement, newer request, and disposal", async () => {
    const pending = deferred(); let current = key;
    const controller = new ArchitectureReviewController(() => {}, () => current, pending.request);
    const first = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    current = "other"; controller.onCanonicalChange(current);
    pending.finish(0, review); await first;
    expect(controller.getState().status).toBe("idle");
    current = key;
    const second = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    controller.clearForDocumentReplacement();
    pending.finish(1, review); await second;
    expect(controller.getState().status).toBe("idle");
    const third = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    const fourth = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    pending.finish(3, review); await fourth;
    pending.finish(2, reviewFailure("review-failed")); await third;
    expect(controller.getState().status).toBe("ready");
    const fifth = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    controller.dispose(); pending.finish(4, review); await fifth;
    expect(controller.getState().status).toBe("loading");
  });

  it("enforces the 75-second deadline even when a request ignores abort", async () => {
    vi.useFakeTimers();
    const controller = new ArchitectureReviewController(() => {}, () => key, () => new Promise(() => {}));
    const task = controller.start(graph, EMPTY_DESIGN_CONTEXT);
    await vi.advanceTimersByTimeAsync(REVIEW_CLIENT_TIMEOUT_MS);
    await task;
    expect(controller.getState()).toMatchObject({ status: "error", error: { type: "review-timeout" } });
  });

  it("rejects empty input before invoking the provider", async () => {
    const request = vi.fn<ArchitectureReviewRequest>();
    const controller = new ArchitectureReviewController(() => {}, () => null, request);
    await controller.start(ArchitectureGraph.empty(), EMPTY_DESIGN_CONTEXT);
    expect(controller.getState()).toMatchObject({ status: "error", error: { type: "empty-architecture" } });
    expect(request).not.toHaveBeenCalled();
  });
});
