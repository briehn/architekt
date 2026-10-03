import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import {
  commitArchitectureEditorHistoryTransaction,
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  replaceArchitectureEditorStateWithoutHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import type { ArchitectureEditorState } from "./architecture-editor-state";
import { captureBoundaryMovement, moveBoundaryBy, translateBoundaryMembers } from "./boundary-movement";

const a = "a" as ComponentId;
const b = "b" as ComponentId;
const c = "c" as ComponentId;
const d = "d" as ComponentId;
const group = "group" as BoundaryId;

function fixture(): ArchitectureEditorState {
  let graph = ArchitectureGraph.empty();
  for (const id of [a, b, c, d]) {
    const result = graph.addComponent({ id, name: id, kind: "service" });
    if (!result.ok) throw new Error("Invalid fixture");
    graph = result.graph;
  }
  for (const [id, members] of [[group, [a, b]], ["other" as BoundaryId, [c]]] as const) {
    const result = graph.addBoundary({ id, name: id, memberComponentIds: members });
    if (!result.ok) throw new Error("Invalid fixture");
    graph = result.graph;
  }
  return {
    graph,
    nodePositions: new Map([
      [a, { x: -20, y: 10 }], [b, { x: 200, y: 50 }],
      [c, { x: 500, y: 70 }], [d, { x: 700, y: 90 }],
    ]),
    designContext: EMPTY_DESIGN_CONTEXT,
    nodeMeasurements: new Map(),
  };
}

describe("boundary movement", () => {
  it("translates only captured members and records one completed drag", () => {
    const start = fixture();
    const capture = captureBoundaryMovement(start, group);
    if (!capture) throw new Error("Expected capture");
    const interim = translateBoundaryMembers(start, capture, { x: 15, y: -5 });
    const moved = translateBoundaryMembers(interim, capture, { x: 60, y: 20 });
    expect(moved.nodePositions.get(a)).toEqual({ x: 40, y: 30 });
    expect(moved.nodePositions.get(b)).toEqual({ x: 260, y: 70 });
    expect(moved.nodePositions.get(c)).toEqual(start.nodePositions.get(c));
    expect(moved.nodePositions.get(d)).toEqual(start.nodePositions.get(d));
    expect(moved.graph).toBe(start.graph);
    const beginning = createArchitectureEditorHistory(start);
    const live = replaceArchitectureEditorStateWithoutHistory(
      replaceArchitectureEditorStateWithoutHistory(beginning, interim),
      moved,
    );
    const history = commitArchitectureEditorHistoryTransaction(beginning, live);
    expect(history.past).toHaveLength(1);
    const undone = undoArchitectureEditorHistory(history);
    expect(undone.present.nodePositions).toBe(start.nodePositions);
    expect(redoArchitectureEditorHistory(undone).present.nodePositions).toBe(moved.nodePositions);
  });

  it("returns to origin without history, and keyboard deltas move by 5 or 20", () => {
    const start = fixture();
    const capture = captureBoundaryMovement(start, group);
    if (!capture) throw new Error("Expected capture");
    const moved = translateBoundaryMembers(start, capture, { x: 30, y: 0 });
    const origin = translateBoundaryMembers(moved, capture, { x: 0, y: 0 });
    expect(origin.nodePositions).toEqual(start.nodePositions);
    const beginning = createArchitectureEditorHistory(start);
    const live = replaceArchitectureEditorStateWithoutHistory(
      replaceArchitectureEditorStateWithoutHistory(beginning, moved),
      origin,
    );
    expect(commitArchitectureEditorHistoryTransaction(beginning, live)).toBe(live);
    expect(live.past).toHaveLength(0);
    expect(moveBoundaryBy(start, group, { x: 0, y: 0 })).toBe(start);
    const five = moveBoundaryBy(start, group, { x: 5, y: 0 });
    const twenty = moveBoundaryBy(five, group, { x: 0, y: -20 });
    expect(twenty.nodePositions.get(a)).toEqual({ x: -15, y: -10 });
    const firstKey = recordArchitectureEditorState(createArchitectureEditorHistory(start), five);
    const secondKey = recordArchitectureEditorState(firstKey, twenty);
    expect(firstKey.past).toHaveLength(1);
    expect(secondKey.past).toHaveLength(2);
  });

  it("does not use geometry to change membership and rejects stale graph captures", () => {
    const start = fixture();
    const capture = captureBoundaryMovement(start, group);
    if (!capture) throw new Error("Expected capture");
    const crossed = moveBoundaryBy(start, group, { x: 1000, y: 0 });
    expect(crossed.graph.getBoundaryById(group)?.memberComponentIds).toEqual([a, b]);
    const renamed = crossed.graph.renameBoundary(group, "Renamed");
    if (!renamed.ok) throw new Error("Invalid fixture");
    expect(translateBoundaryMembers({ ...crossed, graph: renamed.graph }, capture, { x: 50, y: 0 }).nodePositions)
      .toBe(crossed.nodePositions);
  });
});
