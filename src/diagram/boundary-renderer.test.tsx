import { renderToStaticMarkup } from "react-dom/server";
import type { NodeProps } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import {
  BoundaryNode,
  getBoundaryKeyboardAction,
  splitBoundaryNodeChanges,
  toBoundaryFlowNodes,
  type InteractiveBoundaryFlowNode,
} from "./boundary-renderer";
import { toReactFlowDiagram } from "./react-flow-adapter";

const componentId = "boundary:group" as ComponentId;
const boundaryId = "group" as BoundaryId;

function fixture() {
  const added = ArchitectureGraph.empty().addComponent({
    id: componentId, name: "Component", kind: "service",
  });
  if (!added.ok) throw new Error("Invalid component fixture");
  const bounded = added.graph.addBoundary({
    id: boundaryId,
    name: "An unusually long boundary name that should truncate visually",
    memberComponentIds: [componentId],
  });
  if (!bounded.ok) throw new Error("Invalid boundary fixture");
  const empty = bounded.graph.addBoundary({
    id: "empty" as BoundaryId, name: "Empty", memberComponentIds: [],
  });
  if (!empty.ok) throw new Error("Invalid boundary fixture");
  return {
    graph: empty.graph,
    positions: new Map([[componentId, { x: -20, y: 40 }]]),
  };
}

describe("boundary renderer projection", () => {
  it("uses a collision-safe top-level node behind ordinary components and edges", () => {
    const { graph, positions } = fixture();
    const [boundary] = toBoundaryFlowNodes(graph, positions, new Map());
    const componentDiagram = toReactFlowDiagram(graph, positions);
    expect(boundary.id).not.toBe(componentId);
    expect(boundary.type).toBe("boundary");
    expect(boundary.data).toEqual({
      boundaryId,
      name: "An unusually long boundary name that should truncate visually",
    });
    expect(boundary.position).toEqual({ x: -44, y: -16 });
    expect(boundary.zIndex).toBe(-1);
    expect(boundary.dragHandle).toBe(".architekt-boundary__header");
    expect(boundary.connectable).toBe(false);
    expect(boundary.parentId).toBeUndefined();
    expect(boundary.extent).toBeUndefined();
    expect(boundary.expandParent).toBeUndefined();
    expect(componentDiagram.nodes).toHaveLength(1);
    expect(componentDiagram.nodes[0].id).toBe(componentId);
    expect(componentDiagram.nodes[0].position).toBe(positions.get(componentId));
    expect(componentDiagram.edges).toEqual([]);
    expect(toBoundaryFlowNodes(graph, positions, new Map())).toEqual([boundary]);
  });

  it("renders no rectangle for empty boundaries and no handles on a labeled header", () => {
    const { graph, positions } = fixture();
    expect(toBoundaryFlowNodes(graph, positions, new Map())).toHaveLength(1);
    const node = toBoundaryFlowNodes(graph, positions, new Map())[0];
    const markup = renderToStaticMarkup(
      <BoundaryNode {...({
        id: node.id,
        type: "boundary",
        data: { ...node.data, onSelect() {}, onMove() {}, onDelete() {} },
        selected: true,
      } as unknown as NodeProps<InteractiveBoundaryFlowNode>)} />,
    );
    expect(markup).toContain("architekt-boundary--selected");
    expect(markup).toContain("architekt-boundary__name");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("aria-label=\"Boundary An unusually long boundary name that should truncate visually\"");
    expect(markup).not.toContain("react-flow__handle");
  });

  it("keeps boundary changes out of component position and measurement adapters", () => {
    const { graph, positions } = fixture();
    const [boundary] = toBoundaryFlowNodes(graph, positions, new Map());
    const split = splitBoundaryNodeChanges([
      { type: "position", id: boundary.id, position: { x: 100, y: 100 } },
      { type: "dimensions", id: boundary.id, dimensions: { width: 300, height: 200 }, resizing: false },
      { type: "position", id: componentId, position: { x: 12, y: 15 } },
    ], [boundary]);
    expect(split.boundaryChanges).toHaveLength(2);
    expect(split.componentChanges).toEqual([
      { type: "position", id: componentId, position: { x: 12, y: 15 } },
    ]);
  });

  it.each([
    ["ArrowRight", false, { type: "move", delta: { x: 5, y: 0 } }],
    ["ArrowUp", true, { type: "move", delta: { x: 0, y: -20 } }],
    ["Enter", false, { type: "select" }],
    [" ", false, { type: "select" }],
    ["Delete", false, { type: "delete" }],
    ["Backspace", false, { type: "delete" }],
  ] as const)("maps %s keyboard input to a boundary action", (key, shift, action) => {
    expect(getBoundaryKeyboardAction(key, shift, false, false, false)).toEqual(action);
  });

  it("leaves modified keys and Tab to existing canvas or browser behavior", () => {
    expect(getBoundaryKeyboardAction("ArrowRight", false, true, false, false)).toBeNull();
    expect(getBoundaryKeyboardAction("Delete", false, false, true, false)).toBeNull();
    expect(getBoundaryKeyboardAction("Tab", false, false, false, false)).toBeNull();
  });
});
