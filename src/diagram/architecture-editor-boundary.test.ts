import { describe, expect, it } from "vitest";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addBoundaryToEditorState,
  assignComponentToBoundaryInEditorState,
  removeBoundaryFromEditorState,
  removeComponentFromEditorState,
  renameBoundaryInEditorState,
  type ArchitectureEditorState,
} from "./architecture-editor-state";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";

const a = "a" as ComponentId;
const b = "b" as ComponentId;
const first = "first" as BoundaryId;
const second = "second" as BoundaryId;

function initialState(): ArchitectureEditorState {
  let graph = ArchitectureGraph.empty();
  for (const [id, name] of [[a, "A"], [b, "B"]] as const) {
    const result = graph.addComponent({ id, name, kind: "service" });
    if (!result.ok) throw new Error("Invalid component fixture");
    graph = result.graph;
  }
  const connection = graph.addConnection({
    id: "a-b" as ConnectionId,
    sourceComponentId: a,
    targetComponentId: b,
    kind: "request-response",
  });
  if (!connection.ok) throw new Error("Invalid connection fixture");
  return {
    graph: connection.graph,
    nodePositions: new Map([[a, { x: 10, y: 20 }], [b, { x: 100, y: 200 }]]),
    nodeMeasurements: new Map([[a, { width: 200, height: 80 }]]),
  };
}

type StateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: unknown };

function accepted(result: StateResult): ArchitectureEditorState {
  if (!result.ok) throw new Error("Expected accepted edit");
  return result.state;
}

function withBoundaries(): ArchitectureEditorState {
  let state = initialState();
  state = accepted(addBoundaryToEditorState(state, {
    id: first, name: "First", memberComponentIds: [a],
  }));
  return accepted(addBoundaryToEditorState(state, {
    id: second, name: "Second", memberComponentIds: [],
  }));
}

describe("boundary editor operations and snapshot history", () => {
  it.each([
    ["create", (state: ArchitectureEditorState) => addBoundaryToEditorState(state, { id: first, name: "First", memberComponentIds: [a] })],
    ["rename", (state: ArchitectureEditorState) => renameBoundaryInEditorState(state, first, "Renamed")],
    ["assign", (state: ArchitectureEditorState) => assignComponentToBoundaryInEditorState(state, b, second)],
    ["transfer", (state: ArchitectureEditorState) => assignComponentToBoundaryInEditorState(state, a, second)],
    ["ungroup", (state: ArchitectureEditorState) => assignComponentToBoundaryInEditorState(state, a, null)],
    ["delete", (state: ArchitectureEditorState) => removeBoundaryFromEditorState(state, first)],
  ] as const)("records %s once and restores graph and positions on Undo/Redo", (operation, edit) => {
    const original = operation === "create" ? initialState() : withBoundaries();
    const changed = accepted(edit(original));
    expect(changed.nodePositions).toBe(original.nodePositions);
    expect(changed.nodeMeasurements).toBe(original.nodeMeasurements);
    const history = recordArchitectureEditorState(createArchitectureEditorHistory(original), changed);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    const undone = undoArchitectureEditorHistory(history);
    expect(undone.present.graph).toBe(original.graph);
    expect(undone.present.nodePositions).toBe(original.nodePositions);
    const redone = redoArchitectureEditorHistory(undone);
    expect(redone.present.graph).toBe(changed.graph);
    expect(redone.present.nodePositions).toBe(original.nodePositions);
    expect(redone.present.nodeMeasurements).toBe(original.nodeMeasurements);
  });

  it("transfers a component atomically between boundaries", () => {
    const state = withBoundaries();
    const next = accepted(assignComponentToBoundaryInEditorState(state, a, second));
    expect(next.graph.getBoundaryById(first)?.memberComponentIds).toEqual([]);
    expect(next.graph.getBoundaryById(second)?.memberComponentIds).toEqual([a]);
    expect(state.graph.getBoundaryById(first)?.memberComponentIds).toEqual([a]);
  });

  it("preserves exact editor and history identity for boundary no-ops after Undo", () => {
    const initial = withBoundaries();
    const changed = accepted(renameBoundaryInEditorState(initial, first, "Renamed"));
    const undone = undoArchitectureEditorHistory(
      recordArchitectureEditorState(createArchitectureEditorHistory(initial), changed),
    );
    const sameName = accepted(renameBoundaryInEditorState(undone.present, first, "First"));
    const sameGroup = accepted(assignComponentToBoundaryInEditorState(undone.present, a, first));
    const sameNull = accepted(assignComponentToBoundaryInEditorState(undone.present, b, null));
    for (const next of [sameName, sameGroup, sameNull]) {
      expect(next).toBe(undone.present);
      expect(recordArchitectureEditorState(undone, next)).toBe(undone);
    }
    expect(undone.future).toHaveLength(1);
  });

  it("restores component, incident connection, membership, and position in one transition", () => {
    const initial = withBoundaries();
    const removed = accepted(removeComponentFromEditorState(initial, a));
    const history = recordArchitectureEditorState(createArchitectureEditorHistory(initial), removed);
    expect(history.past).toHaveLength(1);
    expect(removed.graph.getBoundaryById(first)?.memberComponentIds).toEqual([]);
    expect(removed.graph.getConnections()).toEqual([]);
    const undone = undoArchitectureEditorHistory(history);
    expect(undone.present.graph.getComponents().some((component) => component.id === a)).toBe(true);
    expect(undone.present.graph.getConnections()).toHaveLength(1);
    expect(undone.present.graph.getBoundaryById(first)?.memberComponentIds).toEqual([a]);
    expect(undone.present.nodePositions.get(a)).toEqual({ x: 10, y: 20 });
    expect(redoArchitectureEditorHistory(undone).present.graph).toBe(removed.graph);
  });

  it("keeps an empty boundary when its last component is deleted", () => {
    const removed = accepted(removeComponentFromEditorState(withBoundaries(), a));
    expect(removed.graph.getBoundaryById(first)?.memberComponentIds).toEqual([]);
  });
});
