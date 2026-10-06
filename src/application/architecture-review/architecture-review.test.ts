import { describe, expect, it, vi } from "vitest";

import { ArchitectureGraph } from "../../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../../domain/identifiers";
import type { DesignContext } from "../design-context";
import { REVIEW_LIMITS, type ArchitectureReviewProvider } from "./architecture-review";
import { buildReviewEvidenceCatalog, formatModeledReviewFact } from "./review-evidence";
import { reviewArchitecture } from "./review-architecture";
import { getArchitectureReviewSnapshotKey, haveSameReviewRelevantContent, prepareArchitectureReviewSnapshot } from "./review-snapshot";
import { validateArchitectureReviewResult } from "./validate-review";

const context: DesignContext = {
  title: "Chat — design",
  requirementsAndConstraints: "Serve users <safely>\n\nKeep chat history.\nUse **Markdown** literally.",
  assumptionsAndOpenQuestions: "What is the workload?\nDo we need 🇯🇵 support?",
  decisionsAndTradeoffs: "Use a database first.",
};

function graph(order: readonly string[] = ["client", "api", "db"]): ArchitectureGraph {
  let result = ArchitectureGraph.empty();
  const components = {
    client: { id: "client" as ComponentId, name: "Browser", kind: "client" as const },
    api: { id: "api" as ComponentId, name: "API", kind: "service" as const },
    db: { id: "db" as ComponentId, name: "PostgreSQL", kind: "database" as const },
  };
  for (const id of order) {
    const next = result.addComponent(components[id as keyof typeof components]);
    if (!next.ok) throw Error("fixture");
    result = next.graph;
  }
  for (const edge of [
    { id: "request" as ConnectionId, sourceComponentId: "client" as ComponentId, targetComponentId: "api" as ComponentId, kind: "request-response" as const },
    { id: "read" as ConnectionId, sourceComponentId: "api" as ComponentId, targetComponentId: "db" as ComponentId, kind: "data-access" as const },
  ]) {
    const next = result.addConnection(edge);
    if (!next.ok) throw Error("fixture");
    result = next.graph;
  }
  for (const boundary of [
    { id: "group" as BoundaryId, name: "Core", memberComponentIds: ["api" as ComponentId, "db" as ComponentId] },
    { id: "empty" as BoundaryId, name: "Later", memberComponentIds: [] },
  ]) {
    const next = result.addBoundary(boundary);
    if (!next.ok) throw Error("fixture");
    result = next.graph;
  }
  return result;
}

function prepared(source = graph(), brief = context) {
  const result = prepareArchitectureReviewSnapshot(source, brief);
  if (!result.ok) throw Error(JSON.stringify(result.error));
  return result.snapshot;
}

function validRaw() {
  return {
    modeledFacts: [{ type: "modeled-fact", evidence: "C1" }, { type: "modeled-fact", evidence: "E2" }],
    statedContext: [{ type: "stated-context", evidence: "D2", excerpt: "<safely>\n\nKeep chat history." }],
    tradeoffs: [{ type: "tradeoff", condition: "requests rise", benefit: "more capacity may help", downside: "cost may rise", evidence: ["C1", "D2"] }],
    questions: [{ type: "question", question: "What traffic is expected?", evidence: ["D3"] }],
  };
}

describe("review snapshot and catalog", () => {
  it("captures all canonical kinds, boundaries, context, and complete analysis without positions", () => {
    const snapshot = prepared();
    expect(snapshot.reviewContractVersion).toBe(1);
    expect(snapshot.analysisContractVersion).toBe(1);
    expect(snapshot.components.map(({ kind }) => kind)).toEqual(["service", "client", "database"]);
    expect(snapshot.connections.map(({ kind }) => kind)).toEqual(["data-access", "request-response"]);
    expect(snapshot.boundaries.map(({ name, memberComponentIds }) => [name, memberComponentIds])).toEqual([["Later", []], ["Core", ["api", "db"]]]);
    expect(snapshot.designContext).toEqual(context);
    expect(snapshot.analysis.summary).toEqual({ componentCount: 3, connectionCount: 2, weaklyConnectedRegionCount: 1, reciprocalPairCount: 0 });
    expect(snapshot.analysis.componentDegrees).toHaveLength(3);
    expect(snapshot.findingDescriptions).toHaveLength(snapshot.analysis.findings.length);
    expect(JSON.stringify(snapshot)).not.toMatch(/position|viewport|measurement|selection|proposal|audio/i);
    expect(Object.isFrozen(snapshot.analysis.findings)).toBe(true);
  });

  it("normalizes insertion order and changes identity for review-relevant edits", () => {
    const first = prepared(graph(["client", "api", "db"]));
    const reordered = prepared(graph(["db", "client", "api"]));
    expect(haveSameReviewRelevantContent(first, reordered)).toBe(true);
    expect(getArchitectureReviewSnapshotKey(first)).toBe(getArchitectureReviewSnapshotKey(reordered));
    const renamed = graph().renameComponent("api" as ComponentId, "Gateway");
    if (!renamed.ok) throw Error("fixture");
    expect(haveSameReviewRelevantContent(first, prepared(renamed.graph))).toBe(false);
    const recategorized = graph().changeComponentKind("api" as ComponentId, "gateway");
    if (!recategorized.ok) throw Error("fixture");
    expect(haveSameReviewRelevantContent(first, prepared(recategorized.graph))).toBe(false);
    const ungrouped = graph().assignComponentToBoundary("api" as ComponentId, null);
    if (!ungrouped.ok) throw Error("fixture");
    expect(haveSameReviewRelevantContent(first, prepared(ungrouped.graph))).toBe(false);
    const anotherEdge = graph().addConnection({ id: "reverse" as ConnectionId, sourceComponentId: "db" as ComponentId, targetComponentId: "api" as ComponentId, kind: "request-response" });
    if (!anotherEdge.ok) throw Error("fixture");
    expect(haveSameReviewRelevantContent(first, prepared(anotherEdge.graph))).toBe(false);
    const removedEdge = graph().removeConnection("read" as ConnectionId);
    if (!removedEdge.ok) throw Error("fixture");
    expect(haveSameReviewRelevantContent(first, prepared(removedEdge.graph))).toBe(false);
    expect(haveSameReviewRelevantContent(first, prepared(graph(), { ...context, title: "Other" }))).toBe(false);
    // Positions, renderer measurements, selection, and viewport are not arguments.
    expect(haveSameReviewRelevantContent(prepared(graph()), prepared(graph()))).toBe(true);
  });

  it("assigns stable typed aliases, disambiguates duplicate visible names, and omits canonical IDs", () => {
    const snapshot = prepared();
    const index = buildReviewEvidenceCatalog(snapshot);
    expect(index.catalog.entries.map(({ alias }) => alias)).toEqual(["C1", "C2", "C3", "E1", "E2", "B1", "B2", "D1", "D2", "D3", "D4"]);
    expect(index.resolve("C1")).toEqual({ type: "component", id: "api" });
    expect(index.resolve("E1")).toEqual({ type: "connection", id: "read" });
    expect(index.resolve("B1")).toEqual({ type: "boundary", id: "empty" });
    expect(index.resolve("D3")).toEqual({ type: "design-context", field: "assumptionsAndOpenQuestions" });
    expect(index.resolve("unknown")).toBeUndefined();
    expect(JSON.stringify(index.catalog)).not.toContain('"id"');
    expect(JSON.stringify(buildReviewEvidenceCatalog(prepared(graph(["db", "api", "client"]))).catalog)).toBe(JSON.stringify(index.catalog));
    const duplicate = graph().renameComponent("db" as ComponentId, "API");
    if (!duplicate.ok) throw Error("fixture");
    expect(formatModeledReviewFact({ type: "component", id: "api" as ComponentId }, prepared(duplicate.graph))).toContain("API (api)");
    expect(JSON.stringify(buildReviewEvidenceCatalog(prepared(duplicate.graph)).catalog)).not.toContain("(api)");
  });

  it("formats only modeled facts and reuses analyzer wording", () => {
    const snapshot = prepared();
    expect(formatModeledReviewFact({ type: "component", id: "api" as ComponentId }, snapshot)).toBe("API is modeled as a Service.");
    expect(formatModeledReviewFact({ type: "connection", id: "read" as ConnectionId }, snapshot)).toBe("API has a directed data access connection to PostgreSQL.");
    expect(formatModeledReviewFact({ type: "boundary", id: "empty" as BoundaryId }, snapshot)).toBe("Later contains 0 modeled components.");
    const isolated = graph().addComponent({ id: "solo" as ComponentId, name: "Solo", kind: "generic" });
    if (!isolated.ok) throw Error("fixture");
    const isolatedSnapshot = prepared(isolated.graph);
    const finding = isolatedSnapshot.analysis.findings[0];
    expect(formatModeledReviewFact({ type: "analysis-finding", key: finding.key }, isolatedSnapshot)).toBe(isolatedSnapshot.findingDescriptions[0].description.message);
    const index = buildReviewEvidenceCatalog(isolatedSnapshot);
    const findingEntries = index.catalog.entries.filter((entry) => entry.category === "analysis-finding");
    expect(findingEntries).toHaveLength(isolatedSnapshot.analysis.findings.length);
    expect(index.resolve(findingEntries[0].alias)).toEqual({ type: "analysis-finding", key: finding.key });
    expect(JSON.stringify(findingEntries[0])).not.toContain('"id"');
    const valid = { modeledFacts: [{ type: "modeled-fact", evidence: findingEntries[0].alias }], statedContext: [], tradeoffs: [], questions: [{ type: "question", question: "Was isolation intended?", evidence: [findingEntries[0].alias] }] };
    expect(validateArchitectureReviewResult(valid, index, isolatedSnapshot).ok).toBe(true);
    const withoutFinding = { ...isolatedSnapshot, analysis: { ...isolatedSnapshot.analysis, findings: [] } };
    expect(validateArchitectureReviewResult(valid, index, withoutFinding).ok).toBe(false);
  });

  it("rejects empty and oversized documents locally without changing the graph", () => {
    expect(prepareArchitectureReviewSnapshot(ArchitectureGraph.empty(), context)).toMatchObject({ ok: false, error: { type: "empty-architecture" } });
    let source = ArchitectureGraph.empty();
    for (let index = 0; index <= REVIEW_LIMITS.components; index++) {
      const next = source.addComponent({ id: `c${index}` as ComponentId, name: `C ${index}`, kind: "generic" });
      if (!next.ok) throw Error("fixture");
      source = next.graph;
    }
    expect(prepareArchitectureReviewSnapshot(source, context)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded" } });
    expect(source.getComponents()).toHaveLength(101);
    expect(prepareArchitectureReviewSnapshot(graph(), { ...context, title: "x".repeat(121) })).toMatchObject({ ok: false, error: { type: "invalid-context" } });
    const longId = ArchitectureGraph.empty().addComponent({ id: "x".repeat(129) as ComponentId, name: "Long", kind: "generic" });
    if (!longId.ok) throw Error("fixture");
    expect(prepareArchitectureReviewSnapshot(longId.graph, context)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded" } });
    const longName = graph().renameComponent("api" as ComponentId, "x".repeat(201));
    if (!longName.ok) throw Error("fixture");
    expect(prepareArchitectureReviewSnapshot(longName.graph, context)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded" } });
  });

  it("enforces connection and boundary count independently", () => {
    let source = ArchitectureGraph.empty();
    for (let index = 0; index < 30; index++) {
      const next = source.addComponent({ id: `c${index}` as ComponentId, name: `C${index}`, kind: "generic" });
      if (!next.ok) throw Error("fixture");
      source = next.graph;
    }
    for (let index = 0; index <= REVIEW_LIMITS.connections; index++) {
      const sourceIndex = Math.floor(index / 29);
      const targetIndex = (sourceIndex + 1 + index % 29) % 30;
      const next = source.addConnection({ id: `e${index}` as ConnectionId, sourceComponentId: `c${sourceIndex}` as ComponentId, targetComponentId: `c${targetIndex}` as ComponentId, kind: "generic" });
      if (!next.ok) throw Error("fixture");
      source = next.graph;
    }
    expect(prepareArchitectureReviewSnapshot(source, context)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded", detail: "connections: maximum 200" } });
    source = graph();
    for (let index = 0; index <= REVIEW_LIMITS.boundaries; index++) {
      const next = source.addBoundary({ id: `b${index}` as BoundaryId, name: `B${index}`, memberComponentIds: [] });
      if (!next.ok) throw Error("fixture");
      source = next.graph;
    }
    expect(prepareArchitectureReviewSnapshot(source, context)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded", detail: "boundaries: maximum 100" } });
  });
});

describe("untrusted review validation", () => {
  const validate = (output: unknown) => {
    const snapshot = prepared();
    return validateArchitectureReviewResult(output, buildReviewEvidenceCatalog(snapshot), snapshot);
  };

  it("resolves a complete review into frozen public evidence with exact excerpts", () => {
    const result = validate(validRaw());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.modeledFacts[0]).toEqual({ evidence: { type: "component", id: "api" }, text: "API is modeled as a Service." });
    expect(result.review.statedContext[0].excerpt).toBe("<safely>\n\nKeep chat history.");
    expect(result.review.questions[0].evidence).toEqual([{ type: "design-context", field: "assumptionsAndOpenQuestions" }]);
    expect(JSON.stringify(result.review)).not.toContain('"alias"');
    expect(Object.isFrozen(result.review.questions[0].evidence)).toBe(true);
  });

  it.each([
    ["unknown top-level", (value: ReturnType<typeof validRaw>) => ({ ...value, id: "provider-id" })],
    ["unknown item field", (value: ReturnType<typeof validRaw>) => ({ ...value, modeledFacts: [{ ...value.modeledFacts[0], id: "provider-id" }] })],
    ["invalid discriminant", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [{ ...value.questions[0], type: "answer" }] })],
    ["unknown alias", (value: ReturnType<typeof validRaw>) => ({ ...value, modeledFacts: [{ type: "modeled-fact", evidence: "C999" }] })],
    ["context as fact", (value: ReturnType<typeof validRaw>) => ({ ...value, modeledFacts: [{ type: "modeled-fact", evidence: "D1" }] })],
    ["graph as context", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ type: "stated-context", evidence: "C1", excerpt: "API" }] })],
    ["missing evidence", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [{ ...value.questions[0], evidence: [] }] })],
    ["duplicate evidence", (value: ReturnType<typeof validRaw>) => ({ ...value, tradeoffs: [{ ...value.tradeoffs[0], evidence: ["C1", "C1"] }] })],
    ["duplicate fact", (value: ReturnType<typeof validRaw>) => ({ ...value, modeledFacts: [value.modeledFacts[0], value.modeledFacts[0]] })],
    ["duplicate context", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [value.statedContext[0], value.statedContext[0]] })],
    ["duplicate question", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [value.questions[0], value.questions[0]] })],
    ["duplicate tradeoff", (value: ReturnType<typeof validRaw>) => ({ ...value, tradeoffs: [value.tradeoffs[0], value.tradeoffs[0]] })],
    ["blank question", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [{ ...value.questions[0], question: "  " }] })],
    ["long question", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [{ ...value.questions[0], question: "x".repeat(301) }] })],
    ["too many questions", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: Array.from({ length: 6 }, (_, index) => ({ type: "question", question: `Question ${index}?`, evidence: ["C1"] })) })],
    ["zero facts", (value: ReturnType<typeof validRaw>) => ({ ...value, modeledFacts: [] })],
    ["zero questions", (value: ReturnType<typeof validRaw>) => ({ ...value, questions: [] })],
    ["paraphrase", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], excerpt: "Keep the history" }] })],
    ["wrong case", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], excerpt: "keep chat history" }] })],
    ["altered whitespace", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], excerpt: "Keep  chat history." }] })],
    ["blank excerpt", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], excerpt: " " }] })],
    ["wrong field", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], evidence: "D1" }] })],
    ["overlong excerpt", (value: ReturnType<typeof validRaw>) => ({ ...value, statedContext: [{ ...value.statedContext[0], excerpt: "x".repeat(401) }] })],
    ["provider-generated ID", (value: ReturnType<typeof validRaw>) => ({ ...value, tradeoffs: [{ ...value.tradeoffs[0], id: "T1" }] })],
    ["blank-context-only tradeoff", (value: ReturnType<typeof validRaw>) => ({ ...value, tradeoffs: [{ ...value.tradeoffs[0], evidence: ["D1"] }] })],
  ])("rejects %s atomically", (_name, mutate) => {
    const output = mutate(validRaw());
    // The title is nonblank here; use a blank field for the last specific case below.
    if (_name === "blank-context-only tradeoff") {
      const snapshot = prepared(graph(), { ...context, title: "" });
      expect(validateArchitectureReviewResult(output, buildReviewEvidenceCatalog(snapshot), snapshot).ok).toBe(false);
    } else expect(validate(output)).toMatchObject({ ok: false, error: { type: "invalid-provider-result" } });
  });

  it("accepts exact Unicode, punctuation and multiline excerpts without normalization", () => {
    for (const [alias, excerpt] of [["D2", "<safely>\n\nKeep chat history."], ["D3", "🇯🇵 support?"]] as const) {
      const raw = { ...validRaw(), statedContext: [{ type: "stated-context", evidence: alias, excerpt }] };
      expect(validate(raw).ok).toBe(true);
    }
  });

  it("allows blank Design Brief evidence for a question, but rejects unsafe raw shapes and size", () => {
    const snapshot = prepared(graph(), { ...context, title: "" });
    const index = buildReviewEvidenceCatalog(snapshot);
    expect(validateArchitectureReviewResult({ ...validRaw(), questions: [{ type: "question", question: "What is the title?", evidence: ["D1"] }] }, index, snapshot).ok).toBe(true);
    expect(validate({ ...validRaw(), questions: [{ ...validRaw().questions[0], question: "x".repeat(65_000) }] }).ok).toBe(false);
    const accessor = Object.defineProperty({}, "modeledFacts", { get: () => { throw Error("must not run"); }, enumerable: true });
    expect(validate(accessor).ok).toBe(false);
  });
});

describe("injected review service", () => {
  it("admits, resolves, and passes alias-only catalog to the provider", async () => {
    const provider: ArchitectureReviewProvider = { review: vi.fn(async (catalog) => {
      expect(catalog.entries[0].alias).toBe("C1");
      expect(JSON.stringify(catalog)).not.toContain('"id"');
      return { ok: true as const, output: validRaw() };
    }) };
    const result = await reviewArchitecture(graph(), context, provider, new AbortController().signal);
    expect(result.ok).toBe(true);
    expect(provider.review).toHaveBeenCalledOnce();
  });

  it("rejects empty input before paid provider call and maps expected failures", async () => {
    const provider: ArchitectureReviewProvider = { review: vi.fn(async () => ({ ok: false as const, type: "provider-unavailable" as const })) };
    expect(await reviewArchitecture(ArchitectureGraph.empty(), context, provider, new AbortController().signal)).toMatchObject({ ok: false, error: { type: "empty-architecture" } });
    expect(provider.review).not.toHaveBeenCalled();
    expect(await reviewArchitecture(graph(), context, provider, new AbortController().signal)).toMatchObject({ ok: false, error: { type: "provider-unavailable" } });
    const malformed: ArchitectureReviewProvider = { review: async () => ({ ok: true, output: { ...validRaw(), questions: [] } }) };
    expect(await reviewArchitecture(graph(), context, malformed, new AbortController().signal)).toMatchObject({ ok: false, error: { type: "invalid-provider-result" } });
  });

  it("propagates abort and preserves caller inputs", async () => {
    const source = graph();
    const priorComponents = source.getComponents();
    const priorContext = JSON.stringify(context);
    const controller = new AbortController();
    const provider: ArchitectureReviewProvider = { review: vi.fn(async (_catalog, signal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
      return { ok: true as const, output: validRaw() };
    }) };
    expect(await reviewArchitecture(source, context, provider, controller.signal)).toMatchObject({ ok: false, error: { type: "review-canceled" } });
    expect(source.getComponents()).toEqual(priorComponents);
    expect(JSON.stringify(context)).toBe(priorContext);
    const preaborted = new AbortController();
    preaborted.abort();
    expect(await reviewArchitecture(source, context, provider, preaborted.signal)).toMatchObject({ ok: false, error: { type: "review-canceled" } });
    expect(provider.review).toHaveBeenCalledOnce();
    const lateController = new AbortController();
    const aborting: ArchitectureReviewProvider = { review: async (_catalog, signal) => {
      expect(signal).toBe(lateController.signal);
      lateController.abort();
      throw Error("AbortError");
    } };
    expect(await reviewArchitecture(source, context, aborting, lateController.signal)).toMatchObject({ ok: false, error: { type: "review-canceled" } });
  });

  it("does not flatten programming errors into expected provider failures", async () => {
    const provider: ArchitectureReviewProvider = { review: async () => { throw Error("programming fault"); } };
    await expect(reviewArchitecture(graph(), context, provider, new AbortController().signal)).rejects.toThrow("programming fault");
  });
});
