import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  DIAGRAM_ANCHOR_HANDLES,
  DIAGRAM_ANCHOR_SIDES,
  withAdaptiveEdgeAnchors,
} from "./adaptive-anchor-renderer";
import { layoutArchitectureGraph } from "./auto-layout";
import type {
  ArchitectureFlowEdge,
  ArchitectureFlowNode,
} from "./react-flow-adapter";
import { toReactFlowDiagram } from "./react-flow-adapter";

function node(
  id: string,
  x: number,
  y: number,
  measured?: ArchitectureFlowNode["measured"],
): ArchitectureFlowNode {
  return {
    id,
    data: { componentId: id as ComponentId, name: id, kind: "service" },
    position: { x, y },
    measured,
  };
}

const edge: ArchitectureFlowEdge = {
  id: "a-to-b",
  source: "a",
  target: "b",
  markerEnd: { type: "arrowclosed" },
  data: { kind: "data-access" },
};

function attached(
  source: ArchitectureFlowNode,
  target: ArchitectureFlowNode,
) {
  return withAdaptiveEdgeAnchors([edge], [source, target])[0];
}

describe("adaptive renderer anchors", () => {
  it("maps every geometry side to one stable React Flow handle", () => {
    expect(DIAGRAM_ANCHOR_SIDES).toEqual(["top", "right", "bottom", "left"]);
    expect(DIAGRAM_ANCHOR_HANDLES).toEqual({
      top: { id: "anchor-top", position: Position.Top },
      right: { id: "anchor-right", position: Position.Right },
      bottom: { id: "anchor-bottom", position: Position.Bottom },
      left: { id: "anchor-left", position: Position.Left },
    });
  });

  it.each([
    ["right", node("a", 0, 0), node("b", 400, 0), "anchor-right", "anchor-left"],
    ["left", node("a", 400, 0), node("b", 0, 0), "anchor-left", "anchor-right"],
    ["below", node("a", 0, 0), node("b", 0, 300), "anchor-bottom", "anchor-top"],
    ["above", node("a", 0, 300), node("b", 0, 0), "anchor-top", "anchor-bottom"],
    ["diagonal", node("a", 0, 0), node("b", 400, 100), "anchor-right", "anchor-left"],
  ] as const)(
    "attaches a target %s of the source",
    (_relation, source, target, sourceHandle, targetHandle) => {
      expect(attached(source, target)).toMatchObject({
        sourceHandle,
        targetHandle,
      });
    },
  );

  it("uses fallback dimensions and changes sides when measured proportions warrant it", () => {
    const source = node("a", 0, 0);
    const target = node("b", 120, 80);

    expect(attached(source, target)).toMatchObject({
      sourceHandle: "anchor-bottom",
      targetHandle: "anchor-top",
    });
    expect(
      attached(
        node("a", 0, 0, { width: 100, height: 200 }),
        node("b", 120, 80, { width: 100, height: 200 }),
      ),
    ).toMatchObject({
      sourceHandle: "anchor-right",
      targetHandle: "anchor-left",
    });
    expect(
      attached(
        node("a", 0, 0, { width: Number.NaN, height: 200 }),
        target,
      ),
    ).toEqual(attached(source, target));
  });

  it("derives new handles after movement without changing edge content", () => {
    const source = node("a", 0, 0);
    const above = node("b", 0, -300);
    const right = node("b", 400, 0);

    expect(attached(source, above)).toMatchObject({
      sourceHandle: "anchor-top",
      targetHandle: "anchor-bottom",
    });
    expect(attached(source, right)).toEqual({
      ...edge,
      sourceHandle: "anchor-right",
      targetHandle: "anchor-left",
    });
    expect(edge).not.toHaveProperty("sourceHandle");
    expect(edge).not.toHaveProperty("targetHandle");
  });

  it("is deterministic for repeated equivalent nodes and preserves inputs", () => {
    const source = Object.freeze(node("a", 20, 10, { width: 210, height: 70 }));
    const target = Object.freeze(node("b", 380, 120, { width: 130, height: 90 }));
    const first = attached(source, target);

    expect(attached(source, target)).toEqual(first);
    expect(attached({ ...source }, { ...target })).toEqual(first);
    expect(source.position).toEqual({ x: 20, y: 10 });
    expect(target.position).toEqual({ x: 380, y: 120 });
    expect(edge).toEqual({
      id: "a-to-b",
      source: "a",
      target: "b",
      markerEnd: { type: "arrowclosed" },
      data: { kind: "data-access" },
    });
  });

  it("keeps ordinary left-to-right Auto-Layout coordinates and attaches right to left", () => {
    const a = { id: "a" as ComponentId, name: "A", kind: "service" as const };
    const b = { id: "b" as ComponentId, name: "B", kind: "database" as const };
    const withA = ArchitectureGraph.empty().addComponent(a);
    if (!withA.ok) throw new Error("Could not add A.");
    const withB = withA.graph.addComponent(b);
    if (!withB.ok) throw new Error("Could not add B.");
    const connected = withB.graph.addConnection({
      id: "a-to-b" as ConnectionId,
      sourceComponentId: a.id,
      targetComponentId: b.id,
      kind: "data-access",
    });
    if (!connected.ok) throw new Error("Could not connect A to B.");
    const layout = layoutArchitectureGraph(connected.graph, new Map());
    if (!layout.ok) throw new Error("Could not lay out the graph.");
    const diagram = toReactFlowDiagram(connected.graph, layout.nodePositions);

    expect(layout.nodePositions).toEqual(
      new Map([
        [a.id, { x: 32, y: 32 }],
        [b.id, { x: 368, y: 32 }],
      ]),
    );
    expect(withAdaptiveEdgeAnchors(diagram.edges, diagram.nodes)[0]).toMatchObject({
      id: "a-to-b",
      source: "a",
      target: "b",
      sourceHandle: "anchor-right",
      targetHandle: "anchor-left",
      data: { kind: "data-access" },
    });
  });
});
