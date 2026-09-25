import { describe, expect, it } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";
import { withAdaptiveEdgeAnchors } from "./adaptive-anchor-renderer";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  undoArchitectureEditorHistory,
  redoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  applyReactFlowNodeChangesToEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
} from "./architecture-editor-state";
import { toReactFlowDiagram, withReactFlowNodeMeasurements } from "./react-flow-adapter";
import { RECIPROCAL_EDGE_TYPE, withReciprocalEdgeTypes } from "./reciprocal-edge-renderer";

function fixture(count: number) {
  let graph = ArchitectureGraph.empty();
  const ids = Array.from({ length: count }, (_, index) => `node-${index}` as ComponentId);
  for (const id of ids) {
    const result = graph.addComponent({ id, name: id, kind: "service" });
    if (!result.ok) throw new Error("Invalid component fixture");
    graph = result.graph;
  }
  for (let index = 0; index < count - 1; index++) {
    for (const [source, target] of [[ids[index], ids[index + 1]], [ids[index + 1], ids[index]]]) {
      const result = graph.addConnection({
        id: `${source}-${target}` as ConnectionId,
        sourceComponentId: source, targetComponentId: target, kind: "generic",
      });
      if (!result.ok) throw new Error("Invalid connection fixture");
      graph = result.graph;
    }
  }
  return {
    ...createArchitectureEditorState(graph),
    nodePositions: new Map(ids.map((id, index) => [id, { x: index * 400, y: index * 100 }])),
  };
}

function deriveEdges(state: ArchitectureEditorState) {
  const diagram = toReactFlowDiagram(state.graph, state.nodePositions);
  return withReciprocalEdgeTypes(withAdaptiveEdgeAnchors(
    diagram.edges,
    withReactFlowNodeMeasurements(diagram.nodes, state.nodeMeasurements),
  ));
}

describe("adaptive anchor integration boundaries", () => {
  it("derives 100 nodes / 198 reciprocal edges deterministically without changing V3 content", () => {
    const state = fixture(100);
    const document = toPersistedArchitectureEditorDocument(state);
    const edges = deriveEdges(state);
    expect(edges).toHaveLength(198);
    expect(edges.every((edge) => edge.type === RECIPROCAL_EDGE_TYPE)).toBe(true);
    expect(edges.every((edge) => edge.sourceHandle && edge.targetHandle)).toBe(true);
    expect(deriveEdges(state)).toEqual(edges);
    expect(toPersistedArchitectureEditorDocument(state)).toEqual(document);
    expect(document).toMatchObject({ schemaVersion: 3 });
    for (const connection of document.graph.connections) {
      expect(Object.keys(connection).sort()).toEqual([
        "id", "kind", "sourceComponentId", "targetComponentId",
      ]);
    }
    expect(JSON.stringify(document)).not.toMatch(/anchor|Handle|pending|roving|reciprocal/);
  });

  it("measurement-only side changes preserve positions, history/redo, and persisted JSON", () => {
    const initial = createArchitectureEditorHistory(fixture(2));
    const moved = recordArchitectureEditorState(initial, applyReactFlowNodeChangesToEditorState(
      initial.present, [{ id: "node-1", type: "position", position: { x: 450, y: 100 } }],
    ));
    const undone = undoArchitectureEditorHistory(moved);
    const before = toPersistedArchitectureEditorDocument(undone.present);
    expect(deriveEdges(undone.present)[0].sourceHandle).toBe("anchor-right");
    const measured = recordArchitectureEditorState(undone, applyReactFlowNodeChangesToEditorState(
      undone.present, ["node-0", "node-1"].map((id) => ({
        id, type: "dimensions" as const, dimensions: { width: 1000, height: 72 },
      })),
    ));
    expect(deriveEdges(measured.present)[0].sourceHandle).toBe("anchor-bottom");
    expect(measured.past).toBe(undone.past);
    expect(measured.future).toBe(undone.future);
    expect(measured.present.graph).toBe(undone.present.graph);
    expect(measured.present.nodePositions).toBe(undone.present.nodePositions);
    expect(toPersistedArchitectureEditorDocument(measured.present)).toEqual(before);
  });

  it("movement changes anchors with only the normal position history transition", () => {
    const initial = createArchitectureEditorHistory(fixture(2));
    const moved = recordArchitectureEditorState(initial, applyReactFlowNodeChangesToEditorState(
      initial.present, [{ id: "node-1", type: "position", position: { x: 0, y: -300 } }],
    ));
    expect(moved.past).toHaveLength(1);
    expect(moved.present.graph).toBe(initial.present.graph);
    expect(Object.keys(moved.past[0]).sort()).toEqual(["graph", "nodePositions"]);
    expect(deriveEdges(moved.present)[0].sourceHandle).toBe("anchor-top");
    const undone = undoArchitectureEditorHistory(moved);
    expect(deriveEdges(undone.present)[0].sourceHandle).toBe("anchor-right");
    expect(deriveEdges(redoArchitectureEditorHistory(undone).present)).toEqual(deriveEdges(moved.present));
  });
});
