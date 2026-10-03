import { describe, expect, it } from "vitest";

import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import { createArchitectureEditorState } from "../diagram/architecture-editor-state";
import { replaceDesignContextInEditorState } from "../diagram/design-context-editor-state";
import { restoreArchitectureEditorState, toPersistedArchitectureEditorDocument } from "./architecture-editor-document";
import { loadLocalArchitectureEditorState, saveLocalArchitectureEditorState, type StorageLike } from "./local-architecture-editor-storage";

const storageKey = "architekt:architecture-editor";
const context = {
  title: "URL shortener",
  requirementsAndConstraints: "Redirects must remain available.",
  assumptionsAndOpenQuestions: "Peak traffic is unknown.",
  decisionsAndTradeoffs: "Cache adds invalidation work.",
};

function contextOnlyState() {
  const result = replaceDesignContextInEditorState(createArchitectureEditorState(ArchitectureGraph.empty()), context);
  if (!result.ok) throw new Error("Invalid context fixture");
  return result.state;
}

function graphWithBoundary() {
  let graph = ArchitectureGraph.empty();
  for (const [id, kind] of [["client", "client"], ["service", "service"]] as const) {
    const result = graph.addComponent({ id: id as ComponentId, name: id, kind });
    if (!result.ok) throw new Error("Invalid component fixture");
    graph = result.graph;
  }
  const connected = graph.addConnection({
    id: "request" as ConnectionId,
    sourceComponentId: "client" as ComponentId,
    targetComponentId: "service" as ComponentId,
    kind: "request-response",
  });
  if (!connected.ok) throw new Error("Invalid connection fixture");
  const bounded = connected.graph.addBoundary({
    id: "edge" as BoundaryId,
    name: "Edge",
    memberComponentIds: ["client" as ComponentId],
  });
  if (!bounded.ok) throw new Error("Invalid boundary fixture");
  return bounded.graph;
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;
  throwOnSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.throwOnSet) throw new Error("Unavailable");
    this.writes += 1;
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

describe("V5 design context document", () => {
  it("round trips empty and context-only documents without synthetic title", () => {
    const emptyDocument = toPersistedArchitectureEditorDocument(createArchitectureEditorState(ArchitectureGraph.empty()));
    expect(emptyDocument).toEqual({
      schemaVersion: 5,
      designContext: EMPTY_DESIGN_CONTEXT,
      graph: { components: [], connections: [], boundaries: [] },
      nodePositions: [],
    });
    const onlyContext = toPersistedArchitectureEditorDocument(contextOnlyState());
    const restored = restoreArchitectureEditorState(JSON.parse(JSON.stringify(onlyContext)));
    if (!restored.ok) throw new Error("Expected V5 restore");
    expect(restored.state.designContext).toEqual(context);
    expect(restored.state.graph.getComponents()).toEqual([]);
    expect(restored.state.nodePositions.size).toBe(0);
    expect(restored.state.nodeMeasurements.size).toBe(0);
  });

  it("round trips graph, boundaries, positions, and context atomically", () => {
    const base = createArchitectureEditorState(graphWithBoundary());
    const state = { ...base, nodePositions: new Map([
      ["client" as ComponentId, { x: -17, y: 49 }],
      ["service" as ComponentId, { x: 420, y: 180 }],
    ]) };
    const edited = replaceDesignContextInEditorState(state, context);
    if (!edited.ok) throw new Error("Invalid context fixture");
    const document = toPersistedArchitectureEditorDocument(edited.state);
    const restored = restoreArchitectureEditorState(JSON.parse(JSON.stringify(document)));
    if (!restored.ok) throw new Error("Expected V5 restore");
    expect(restored.state.designContext).toEqual(context);
    expect(restored.state.graph.getBoundaries()).toEqual(edited.state.graph.getBoundaries());
    expect(restored.state.graph.getConnections()).toEqual(edited.state.graph.getConnections());
    expect(restored.state.nodePositions).toEqual(edited.state.nodePositions);
  });

  it("loads V1-V4 without writing and supplies empty context", () => {
    const current = toPersistedArchitectureEditorDocument(createArchitectureEditorState(graphWithBoundary()));
    for (const version of [1, 2, 3, 4] as const) {
      const graph = {
        components: current.graph.components.map((component) => version === 1
          ? { id: component.id, name: component.name }
          : component),
        connections: current.graph.connections.map((connection) => version <= 2
          ? { id: connection.id, sourceComponentId: connection.sourceComponentId, targetComponentId: connection.targetComponentId }
          : connection),
        ...(version === 4 ? { boundaries: current.graph.boundaries } : {}),
      };
      const legacy = { schemaVersion: version, graph, nodePositions: current.nodePositions };
      const storage = new MemoryStorage();
      storage.values.set(storageKey, JSON.stringify(legacy));
      const loaded = loadLocalArchitectureEditorState(storage);
      if (loaded.status !== "loaded") throw new Error("Expected legacy restore");
      expect(loaded.state.designContext).toBe(EMPTY_DESIGN_CONTEXT);
      expect(loaded.state.nodePositions).toEqual(createArchitectureEditorState(graphWithBoundary()).nodePositions);
      expect(loaded.state.graph.getBoundaries()).toHaveLength(version === 4 ? 1 : 0);
      expect(storage.writes).toBe(0);
      expect(storage.values.get(storageKey)).toBe(JSON.stringify(legacy));
    }
  });

  it("rejects malformed or missing V5 context through recovery without touching saved bytes", () => {
    const valid = toPersistedArchitectureEditorDocument(contextOnlyState());
    const invalidContexts: unknown[] = [
      undefined, null, { title: "Only title" }, { ...context, title: 17 },
      { ...context, title: "x".repeat(121) },
      { ...context, requirementsAndConstraints: "x".repeat(5001) },
      { ...context, assumptionsAndOpenQuestions: "x".repeat(5001) },
      { ...context, decisionsAndTradeoffs: "x".repeat(5001) },
    ];
    for (const invalidContext of invalidContexts) {
      const invalid = { ...valid, designContext: invalidContext };
      expect(restoreArchitectureEditorState(invalid)).toEqual({ ok: false, error: { type: "invalid-document" } });
      const storage = new MemoryStorage();
      const bytes = JSON.stringify(invalid);
      storage.values.set(storageKey, bytes);
      expect(loadLocalArchitectureEditorState(storage)).toEqual({ status: "failed", error: { type: "saved-state-invalid" } });
      expect(storage.values.get(storageKey)).toBe(bytes);
      expect(storage.writes).toBe(0);
    }
  });

  it("rejects an invalid V5 graph or positions even with valid context", () => {
    const valid = toPersistedArchitectureEditorDocument(contextOnlyState());
    expect(restoreArchitectureEditorState({ ...valid, graph: { ...valid.graph, components: [{ id: "x", name: "X", kind: "service" }] } }).ok).toBe(false);
    expect(restoreArchitectureEditorState({ ...valid, nodePositions: [{ componentId: "absent", x: 0, y: 0 }] }).ok).toBe(false);
  });

  it("saves a committed context and keeps it in memory when storage fails", () => {
    const storage = new MemoryStorage();
    const state = contextOnlyState();
    storage.throwOnSet = true;
    expect(saveLocalArchitectureEditorState(storage, state)).toEqual({ ok: false, error: { type: "storage-unavailable" } });
    expect(state.designContext).toEqual(context);
    expect(storage.values.size).toBe(0);
    storage.throwOnSet = false;
    expect(saveLocalArchitectureEditorState(storage, state)).toEqual({ ok: true });
    const loaded = loadLocalArchitectureEditorState(storage);
    if (loaded.status !== "loaded") throw new Error("Expected restored context");
    expect(loaded.state.designContext).toEqual(context);
  });
});
