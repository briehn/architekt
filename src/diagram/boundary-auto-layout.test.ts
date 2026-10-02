import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import {
  layoutArchitectureGraph,
  layoutBoundaryAwareArchitectureGraph,
  type DiagramNodeSizes,
} from "./auto-layout";
import { deriveBoundaryRectangles } from "./boundary-geometry";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  autoLayoutArchitectureEditorState,
  createArchitectureEditorState,
} from "./architecture-editor-state";
import { recordAutoLayoutFromEditorAction } from "./architecture-editor";

const dagreFailure = vi.hoisted(() => ({ callCount: 0, failAt: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dagrejs/dagre")>();
  return {
    ...actual,
    layout: (...args: Parameters<typeof actual.layout>) => {
      dagreFailure.callCount += 1;
      if (dagreFailure.callCount === dagreFailure.failAt) throw new Error("Injected layout failure");
      return actual.layout(...args);
    },
  };
});

beforeEach(() => {
  dagreFailure.callCount = 0;
  dagreFailure.failAt = 0;
});

type Edge = readonly [string, string, string];
type Boundary = readonly [string, readonly string[]];

function graphWith(ids: readonly string[], edges: readonly Edge[] = [], boundaries: readonly Boundary[] = []) {
  let graph = ArchitectureGraph.empty();
  for (const id of ids) {
    const result = graph.addComponent({ id: id as ComponentId, name: id, kind: "service" });
    if (!result.ok) throw new Error("Invalid component fixture");
    graph = result.graph;
  }
  for (const [id, source, target] of edges) {
    const result = graph.addConnection({
      id: id as ConnectionId,
      sourceComponentId: source as ComponentId,
      targetComponentId: target as ComponentId,
      kind: "generic",
    });
    if (!result.ok) throw new Error("Invalid connection fixture");
    graph = result.graph;
  }
  for (const [id, members] of boundaries) {
    const result = graph.addBoundary({
      id: id as BoundaryId,
      name: id,
      memberComponentIds: members.map((member) => member as ComponentId),
    });
    if (!result.ok) throw new Error("Invalid boundary fixture");
    graph = result.graph;
  }
  return graph;
}

function positionsFor(graph: ArchitectureGraph, sizes: DiagramNodeSizes = new Map()) {
  const result = layoutBoundaryAwareArchitectureGraph(graph, sizes);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected layout to succeed");
  expect(result.nodePositions.size).toBe(graph.getComponents().length);
  return result.nodePositions;
}

function expectDisjointRectangles(graph: ArchitectureGraph, positions: ReturnType<typeof positionsFor>, sizes: DiagramNodeSizes = new Map()) {
  const rectangles = deriveBoundaryRectangles(graph, positions, sizes);
  for (let index = 0; index < rectangles.length; index += 1) {
    const left = rectangles[index];
    const boundary = graph.getBoundaryById(left.boundaryId);
    if (!boundary) throw new Error("Missing boundary fixture");
    for (const memberId of boundary.memberComponentIds) {
      const member = positions.get(memberId);
      const size = sizes.get(memberId) ?? { width: 176, height: 72 };
      if (!member) throw new Error("Missing member position");
      expect(member.x).toBeGreaterThanOrEqual(left.x + 24);
      expect(member.y).toBeGreaterThanOrEqual(left.y + 56);
      expect(member.x + size.width).toBeLessThanOrEqual(left.x + left.width - 24);
      expect(member.y + size.height).toBeLessThanOrEqual(left.y + left.height - 24);
    }
    for (const right of rectangles.slice(index + 1)) {
      expect(
        left.x >= right.x + right.width ||
        right.x >= left.x + left.width ||
        left.y >= right.y + right.height ||
        right.y >= left.y + left.height,
      ).toBe(true);
    }
  }
  return rectangles;
}

describe("boundary-aware Auto-Layout", () => {
  it("preserves exact flat coordinates with no non-empty boundaries", () => {
    const graph = graphWith(["client", "api", "db"], [
      ["c-a", "client", "api"], ["a-d", "api", "db"],
    ], [["empty", []]]);
    const flat = layoutArchitectureGraph(graph, new Map());
    expect(flat.ok).toBe(true);
    if (!flat.ok) return;
    expect(positionsFor(graph)).toEqual(flat.nodePositions);
    expect(flat.nodePositions).toEqual(new Map([
        ["client", { x: 32, y: 32 }],
        ["api", { x: 368, y: 32 }],
        ["db", { x: 704, y: 32 }],
      ]));
    expect(dagreFailure.callCount).toBe(2);
  });

  it.each([
    ["chain", [["a-b", "a", "b"], ["b-c", "b", "c"]]],
    ["disconnected", [["a-b", "a", "b"]]],
    ["cycle", [["a-b", "a", "b"], ["b-c", "b", "c"], ["c-a", "c", "a"]]],
    ["reciprocal", [["a-b", "a", "b"], ["b-a", "b", "a"]]],
  ] satisfies readonly (readonly [string, readonly Edge[]])[])("arranges internal %s members", (_name, edges) => {
    const graph = graphWith(["a", "b", "c"], edges, [["group", ["a", "b", "c"]]]);
    const first = positionsFor(graph);
    expectDisjointRectangles(graph, first);
    expect(positionsFor(graph)).toEqual(first);
  });

  it("separates two boundaries and ungrouped nodes with directed cross-block edges", () => {
    const graph = graphWith(["a", "b", "c", "d", "free", "outside"], [
      ["a-b", "a", "b"], ["c-d", "c", "d"],
      ["a-c", "a", "c"], ["b-d", "b", "d"],
      ["d-free", "d", "free"], ["free-outside", "free", "outside"],
    ], [["first", ["a", "b"]], ["second", ["c", "d"]], ["empty", []]]);
    const positions = positionsFor(graph);
    const rectangles = expectDisjointRectangles(graph, positions);
    expect(rectangles).toHaveLength(2);
    for (const id of ["free", "outside"]) {
      const position = positions.get(id as ComponentId)!;
      expect(rectangles.every((rect) =>
        position.x >= rect.x + rect.width || position.x + 176 <= rect.x ||
        position.y >= rect.y + rect.height || position.y + 72 <= rect.y,
      )).toBe(true);
    }
    expect(rectangles[0].x).toBeLessThan(rectangles[1].x);
    expect(rectangles[1].x).toBeLessThan(positions.get("free" as ComponentId)!.x);
    expect(positionsFor(graph)).toEqual(positions);
  });

  it("coalesces repeated ordered cross-boundary relationships", () => {
    const base = graphWith(["a", "b", "c", "d"], [
      ["a-c", "a", "c"],
    ], [["left", ["a", "b"]], ["right", ["c", "d"]]]);
    const extra = graphWith(["a", "b", "c", "d"], [
      ["a-c", "a", "c"], ["a-d", "a", "d"], ["b-c", "b", "c"], ["b-d", "b", "d"],
    ], [["left", ["a", "b"]], ["right", ["c", "d"]]]);
    expect(positionsFor(extra)).toEqual(positionsFor(base));
  });

  it("supports cyclic and disconnected outer blocks", () => {
    const graph = graphWith(["a", "b", "free", "isolated"], [
      ["a-b", "a", "b"], ["b-free", "b", "free"], ["free-a", "free", "a"],
    ], [["first", ["a"]], ["second", ["b"]]]);
    const positions = positionsFor(graph);
    expectDisjointRectangles(graph, positions);
    expect(positions.get("isolated" as ComponentId)!.y).toBeGreaterThan(positions.get("free" as ComponentId)!.y);
  });

  it("uses current measurements and shared fallback without changing graph or membership", () => {
    const graph = graphWith(["a", "b", "free"], [["a-b", "a", "b"]], [["group", ["a", "b"]]]);
    const sizes: DiagramNodeSizes = new Map([
      ["a" as ComponentId, { width: 240, height: 100 }],
      ["b" as ComponentId, { width: Number.NaN, height: 5 }],
    ]);
    const before = graph.getBoundaries();
    const positions = positionsFor(graph, sizes);
    expectDisjointRectangles(graph, positions, new Map([["a" as ComponentId, { width: 240, height: 100 }]]));
    expect(graph.getBoundaries()).toEqual(before);
    expect(graph.getComponents()).toHaveLength(3);
    expect(Object.keys(before[0])).toEqual(["id", "name", "memberComponentIds"]);
    expect(positionsFor(graph, sizes)).toEqual(positions);
  });

  it("is independent of insertion order for grouped equivalent graphs", () => {
    const edges: Edge[] = [["a-b", "a", "b"], ["b-c", "b", "c"], ["c-d", "c", "d"]];
    const first = graphWith(["a", "b", "c", "d"], edges, [["one", ["b", "a"]], ["two", ["d", "c"]]]);
    const second = graphWith(["d", "c", "b", "a"], [...edges].reverse(), [["two", ["c", "d"]], ["one", ["a", "b"]]]);
    expect(positionsFor(second)).toEqual(positionsFor(first));
  });

  it("records one history transition, then restores all positions with Undo/Redo and preserves a no-op redo", () => {
    const graph = graphWith(["a", "b", "free"], [["a-b", "a", "b"]], [["group", ["a", "b"]]]);
    const original = createArchitectureEditorState(graph);
    const measurements = new Map([["a" as ComponentId, { width: 210, height: 85 }]]);
    const state = { ...original, nodeMeasurements: measurements };
    const layout = autoLayoutArchitectureEditorState(state);
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.state.graph).toBe(graph);
    expect(layout.state.nodeMeasurements).toBe(measurements);
    const history = recordArchitectureEditorState(createArchitectureEditorHistory(state), layout.state);
    expect(history.past).toHaveLength(1);
    const undone = undoArchitectureEditorHistory(history);
    expect(undone.present.nodePositions).toEqual(state.nodePositions);
    expect(redoArchitectureEditorHistory(undone).present.nodePositions).toEqual(layout.state.nodePositions);
    const noOp = autoLayoutArchitectureEditorState(layout.state);
    expect(noOp).toEqual({ ok: true, state: layout.state });
    if (!noOp.ok) return;
    expect(noOp.state).toBe(layout.state);
    const moved = {
      ...layout.state,
      nodePositions: new Map(layout.state.nodePositions).set("free" as ComponentId, { x: 900, y: 900 }),
    };
    const withRedo = undoArchitectureEditorHistory(recordArchitectureEditorState(
      createArchitectureEditorHistory(layout.state), moved,
    ));
    const unchanged = recordAutoLayoutFromEditorAction(withRedo);
    expect(unchanged.ok).toBe(true);
    if (!unchanged.ok) return;
    expect(unchanged.changed).toBe(false);
    expect(unchanged.history).toBe(withRedo);
    expect(unchanged.history.future).toHaveLength(1);
  });

  it.each([1, 2, 3])("fails atomically when Dagre pass %i fails", (failAt) => {
    const graph = graphWith(["a", "b", "free"], [["a-b", "a", "b"]], [["group", ["a", "b"]]]);
    const state = createArchitectureEditorState(graph);
    dagreFailure.failAt = failAt;
    const result = autoLayoutArchitectureEditorState(state);
    expect(result).toEqual({ ok: false, error: { type: "layout-failed" } });
    const history = createArchitectureEditorHistory(state);
    dagreFailure.callCount = 0;
    const action = recordAutoLayoutFromEditorAction(history);
    expect(action).toEqual({ ok: false, error: { type: "layout-failed" } });
    expect(history.past).toHaveLength(0);
    expect(history.present).toBe(state);
    expect(state.nodePositions).toEqual(new Map([
      ["a", { x: 0, y: 0 }], ["b", { x: 240, y: 0 }], ["free", { x: 480, y: 0 }],
    ]));
  });

  it("handles about 100 components and 200 edges across several boundaries", () => {
    const ids = Array.from({ length: 100 }, (_unused, index) => `node-${String(index).padStart(3, "0")}`);
    const edges: Edge[] = [];
    for (let index = 0; index < 99; index += 1) edges.push([`chain-${index}`, ids[index], ids[index + 1]]);
    for (let index = 0; index < 98; index += 1) edges.push([`skip-${index}`, ids[index], ids[index + 2]]);
    for (let index = 0; index < 3; index += 1) edges.push([`extra-${index}`, ids[index], ids[index + 3]]);
    const graph = graphWith(ids, edges, [
      ["first", ids.slice(0, 25)], ["second", ids.slice(25, 50)],
      ["third", ids.slice(50, 75)], ["empty", []],
    ]);
    expect(graph.getConnections()).toHaveLength(200);
    const positions = positionsFor(graph);
    expectDisjointRectangles(graph, positions);
    expect(positionsFor(graph)).toEqual(positions);
  });
});
