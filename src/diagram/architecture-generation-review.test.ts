import { describe, expect, it, vi } from "vitest";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { generationFailure } from "../application/architecture-generation";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId } from "../domain/identifiers";
import { createArchitectureEditorHistory } from "./architecture-editor-history";
import { createArchitectureEditorState } from "./architecture-editor-state";
import { replaceDesignContextInEditorState } from "./design-context-editor-state";
import {
  ArchitectureGenerationReviewController,
  requestArchitectureGeneration,
  type ArchitectureGenerationRequest,
} from "./architecture-generation-review";

function deferredRequest() {
  const resolvers: Array<(value: Awaited<ReturnType<ArchitectureGenerationRequest>>) => void> = [];
  const request = vi.fn<ArchitectureGenerationRequest>(() => new Promise((next) => { resolvers.push(next); }));
  return { request, resolve: (index: number, value: Awaited<ReturnType<ArchitectureGenerationRequest>>) => resolvers[index](value) };
}

describe("transient generation review", () => {
  it("holds a validated proposal for explicit review, then discards it", async () => {
    const workspace = createArchitectureEditorHistory(createArchitectureEditorState(ArchitectureGraph.empty()));
    const pending = deferredRequest();
    const changes = vi.fn();
    const controller = new ArchitectureGenerationReviewController(changes, pending.request);
    controller.setPrompt("  A small app  ");
    const generation = controller.generate();
    expect(pending.request).toHaveBeenCalledWith("A small app", expect.any(AbortSignal));
    expect(controller.getState().status).toBe("loading");
    pending.resolve(0, minimalProposal());
    await generation;
    expect(controller.getState()).toMatchObject({ status: "review", proposal: minimalProposal(), applyError: false });
    controller.discard();
    expect(controller.getState()).toEqual({ status: "idle", prompt: "  A small app  " });
    expect(workspace.present.graph.getComponents()).toEqual([]);
    expect(workspace.past).toEqual([]);
  });

  it("aborts cancellation and ignores a late response after a newer request", async () => {
    const pending = deferredRequest();
    const controller = new ArchitectureGenerationReviewController(() => {}, pending.request);
    controller.setPrompt("First system");
    const first = controller.generate();
    const firstSignal = pending.request.mock.calls[0][1];
    controller.cancel();
    expect(firstSignal.aborted).toBe(true);
    controller.setPrompt("Second system");
    const second = controller.generate();
    pending.resolve(1, minimalProposal());
    await second;
    expect(controller.getState()).toMatchObject({ status: "review", prompt: "Second system" });
    pending.resolve(0, generationFailure("generation-failed"));
    await first;
    expect(controller.getState()).toMatchObject({ status: "review", prompt: "Second system" });
  });

  it("ignores completion after unmount disposal", async () => {
    const pending = deferredRequest();
    const changes = vi.fn();
    const controller = new ArchitectureGenerationReviewController(changes, pending.request);
    controller.setPrompt("A system");
    const generation = controller.generate();
    const callsBeforeDispose = changes.mock.calls.length;
    controller.dispose();
    expect(pending.request.mock.calls[0][1].aborted).toBe(true);
    pending.resolve(0, minimalProposal());
    await generation;
    expect(changes).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  it("keeps errors transient and protects the proposal on Apply failure", async () => {
    const workspace = createArchitectureEditorHistory(createArchitectureEditorState(ArchitectureGraph.empty()));
    const controller = new ArchitectureGenerationReviewController(() => {}, async () => generationFailure("generation-timeout"));
    controller.setPrompt("A system");
    await controller.generate();
    expect(controller.getState()).toMatchObject({ status: "error", error: { type: "generation-timeout", retryable: true } });
    const success = new ArchitectureGenerationReviewController(() => {}, async () => minimalProposal());
    success.setPrompt("A system");
    await success.generate();
    success.applyFailed();
    expect(success.getState()).toMatchObject({ status: "review", applyError: true, proposal: minimalProposal() });
    expect(workspace.present.graph.getComponents()).toEqual([]);
    expect(workspace.past).toEqual([]);
  });

  it("consumes typed API failures and revalidates successful data", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async () => Response.json({ error: generationFailure("generation-rate-limited") }, { status: 429 }));
      expect(await requestArchitectureGeneration("A system", new AbortController().signal)).toEqual(generationFailure("generation-rate-limited"));
      globalThis.fetch = vi.fn(async () => Response.json({ ...minimalProposal(), positions: [] }));
      expect(await requestArchitectureGeneration("A system", new AbortController().signal)).toEqual(generationFailure("invalid-generation"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("generation review preserves boundaries", () => {
  it("leaves a boundary-only workspace untouched on Cancel, failure, and Discard", async () => {
    const bounded = ArchitectureGraph.empty().addBoundary({
      id: "empty" as BoundaryId,
      name: "Empty boundary",
      memberComponentIds: [],
    });
    if (!bounded.ok) throw new Error("Invalid boundary fixture");
    const withContext = replaceDesignContextInEditorState(createArchitectureEditorState(bounded.graph), {
      title: "User brief",
      requirementsAndConstraints: "A requirement",
      assumptionsAndOpenQuestions: "An open question",
      decisionsAndTradeoffs: "A tradeoff",
    });
    if (!withContext.ok) throw new Error("Invalid context fixture");
    const workspace = createArchitectureEditorHistory(withContext.state);
    const pending = deferredRequest();
    const controller = new ArchitectureGenerationReviewController(() => {}, pending.request);
    controller.setPrompt("A system");
    const cancelled = controller.generate();
    controller.cancel();
    pending.resolve(0, minimalProposal());
    await cancelled;
    expect(controller.getState().status).toBe("idle");
    expect(workspace.present.graph).toBe(bounded.graph);
    expect(workspace.present.designContext).toBe(withContext.state.designContext);

    const failed = controller.generate();
    pending.resolve(1, generationFailure("generation-failed"));
    await failed;
    expect(controller.getState().status).toBe("error");
    expect(workspace.present.graph).toBe(bounded.graph);
    expect(workspace.present.designContext).toBe(withContext.state.designContext);

    const generated = controller.generate();
    pending.resolve(2, minimalProposal());
    await generated;
    controller.discard();
    expect(controller.getState().status).toBe("idle");
    expect(workspace.present.graph).toBe(bounded.graph);
    expect(workspace.present.designContext).toBe(withContext.state.designContext);
    expect(workspace.present.graph.getBoundaries()).toHaveLength(1);
    expect(workspace.past).toHaveLength(0);
  });
});
