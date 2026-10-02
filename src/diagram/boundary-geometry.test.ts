import { describe, expect, it } from "vitest";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import { deriveBoundaryRectangle, deriveBoundaryRectangles } from "./boundary-geometry";
import { applyReactFlowNodeChangesToEditorState, projectKnownNodeSizes } from "./architecture-editor-state";
import { createArchitectureEditorHistory, recordArchitectureEditorState } from "./architecture-editor-history";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";

const a = "a" as ComponentId;
const b = "b" as ComponentId;

function fixture(memberComponentIds: ComponentId[]) {
  let graph = ArchitectureGraph.empty();
  for (const id of [a, b]) {
    const added = graph.addComponent({ id, name: id, kind: "service" });
    if (!added.ok) throw new Error("Invalid fixture");
    graph = added.graph;
  }
  const boundary = { id: "group" as BoundaryId, name: "A long boundary name that should not affect geometry", memberComponentIds };
  const added = graph.addBoundary(boundary);
  if (!added.ok) throw new Error("Invalid fixture");
  return { graph: added.graph, boundary };
}

describe("derived boundary geometry", () => {
  it("uses shared fallback size, header, gap, padding, and minimum size", () => {
    const { boundary } = fixture([a]);
    expect(deriveBoundaryRectangle(boundary, new Map([[a, { x: -100, y: -50 }]]), new Map()))
      .toEqual({
        boundaryId: boundary.id,
        name: boundary.name,
        x: -124,
        y: -106,
        width: 240,
        height: 160,
      });
  });

  it("bounds unequal measured members and ignores invalid sizes", () => {
    const { graph } = fixture([a, b]);
    const positions = new Map([[a, { x: -100, y: 20 }], [b, { x: 300, y: -80 }]]);
    const sizes = new Map([
      [a, { width: 200, height: 90 }],
      [b, { width: Number.NaN, height: -4 }],
    ]);
    const [rect] = deriveBoundaryRectangles(graph, positions, sizes);
    expect(rect).toMatchObject({ x: -124, y: -136, width: 624, height: 270 });
  });

  it("changes only derived geometry when a member moves or is remeasured", () => {
    const { graph } = fixture([a, b]);
    const positions = new Map([[a, { x: 0, y: 0 }], [b, { x: 250, y: 100 }]]);
    const before = deriveBoundaryRectangles(graph, positions, new Map())[0];
    const moved = deriveBoundaryRectangles(graph, new Map([
      [a, { x: -100, y: -40 }], [b, positions.get(b)!],
    ]), new Map())[0];
    const measured = deriveBoundaryRectangles(graph, positions, new Map([
      [b, { width: 260, height: 120 }],
    ]))[0];
    expect(moved.x).toBeLessThan(before.x);
    expect(moved.y).toBeLessThan(before.y);
    expect(measured.width).toBeGreaterThan(before.width);
    expect(measured.height).toBeGreaterThan(before.height);
    expect(graph.getBoundaryById("group" as BoundaryId)?.memberComponentIds).toEqual([a, b]);
    expect(positions.get(a)).toEqual({ x: 0, y: 0 });
  });

  it("re-measures a boundary without changing graph, positions, history, or persistence", () => {
    const { graph } = fixture([a, b]);
    const state = {
      graph,
      nodePositions: new Map([[a, { x: 0, y: 0 }], [b, { x: 250, y: 100 }]]),
      nodeMeasurements: new Map(),
    };
    const before = deriveBoundaryRectangles(graph, state.nodePositions, projectKnownNodeSizes(state))[0];
    const measured = applyReactFlowNodeChangesToEditorState(state, [{
      type: "dimensions", id: b, dimensions: { width: 260, height: 120 }, resizing: false,
    }]);
    const after = deriveBoundaryRectangles(graph, measured.nodePositions, projectKnownNodeSizes(measured))[0];
    expect(after.width).toBeGreaterThan(before.width);
    expect(measured.graph).toBe(state.graph);
    expect(measured.nodePositions).toBe(state.nodePositions);
    expect(recordArchitectureEditorState(createArchitectureEditorHistory(state), measured).past).toEqual([]);
    expect(toPersistedArchitectureEditorDocument(measured)).toEqual(
      toPersistedArchitectureEditorDocument(state),
    );
  });

  it("does not let a boundary rename change its rectangle dimensions", () => {
    const { graph } = fixture([a]);
    const positions = new Map([[a, { x: 0, y: 0 }]]);
    const before = deriveBoundaryRectangles(graph, positions, new Map())[0];
    const renamed = graph.renameBoundary("group" as BoundaryId, "X");
    if (!renamed.ok) throw new Error("Invalid rename fixture");
    const after = deriveBoundaryRectangles(renamed.graph, positions, new Map())[0];
    expect({ ...after, name: before.name }).toEqual(before);
  });

  it("omits empty boundaries even with a long name", () => {
    const { graph, boundary } = fixture([]);
    expect(deriveBoundaryRectangle(boundary, new Map(), new Map())).toBeNull();
    expect(deriveBoundaryRectangles(graph, new Map(), new Map())).toEqual([]);
  });
});
