import type { Node, NodeChange, NodeProps } from "@xyflow/react";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId } from "../domain/identifiers";
import type { DiagramNodePositions, DiagramPosition } from "./diagram-layout";
import type { DiagramNodeSizes } from "./diagram-node-size";
import { deriveBoundaryRectangles } from "./boundary-geometry";

export type BoundaryFlowNodeData = Readonly<{
  boundaryId: BoundaryId;
  name: string;
}>;

export type BoundaryFlowNode = Node<BoundaryFlowNodeData, "boundary">;

export type InteractiveBoundaryFlowNode = Node<
  BoundaryFlowNodeData & Readonly<{
    onSelect(): void;
    onMove(delta: DiagramPosition): void;
    onDelete(): void;
  }>,
  "boundary"
>;

export function toBoundaryFlowNodes(
  graph: ArchitectureGraph,
  nodePositions: DiagramNodePositions,
  knownNodeSizes: DiagramNodeSizes,
): BoundaryFlowNode[] {
  const occupiedIds = new Set(graph.getComponents().map(({ id }) => id as string));
  return deriveBoundaryRectangles(graph, nodePositions, knownNodeSizes).map((rectangle) => {
    let rendererId = "boundary:" + encodeURIComponent(rectangle.boundaryId);
    while (occupiedIds.has(rendererId)) rendererId = "boundary:" + rendererId;
    occupiedIds.add(rendererId);
    return {
      id: rendererId,
      type: "boundary",
      data: { boundaryId: rectangle.boundaryId, name: rectangle.name },
      position: { x: rectangle.x, y: rectangle.y },
      style: {
        width: rectangle.width,
        height: rectangle.height,
        pointerEvents: "none",
      },
      zIndex: -1,
      dragHandle: ".architekt-boundary__header",
      connectable: false,
      focusable: false,
      selectable: true,
      draggable: true,
      ariaLabel: "Boundary " + rectangle.name,
    };
  });
}

export function splitBoundaryNodeChanges(
  changes: readonly NodeChange[],
  boundaryNodes: readonly BoundaryFlowNode[],
): Readonly<{ componentChanges: NodeChange[]; boundaryChanges: NodeChange[] }> {
  const boundaryIds = new Set(boundaryNodes.map(({ id }) => id));
  const componentChanges: NodeChange[] = [];
  const boundaryChanges: NodeChange[] = [];
  for (const change of changes) {
    const id = "id" in change
      ? change.id
      : change.type === "add"
        ? change.item.id
        : null;
    (id !== null && boundaryIds.has(id) ? boundaryChanges : componentChanges).push(change);
  }
  return { componentChanges, boundaryChanges };
}

export type BoundaryKeyboardAction =
  | { type: "select" }
  | { type: "delete" }
  | { type: "move"; delta: DiagramPosition };

export function getBoundaryKeyboardAction(
  key: string,
  shiftKey: boolean,
  altKey: boolean,
  ctrlKey: boolean,
  metaKey: boolean,
): BoundaryKeyboardAction | null {
  if (altKey || ctrlKey || metaKey) return null;
  const step = shiftKey ? 20 : 5;
  switch (key) {
    case "Enter":
    case " ":
      return { type: "select" };
    case "Delete":
    case "Backspace":
      return { type: "delete" };
    case "ArrowLeft":
      return { type: "move", delta: { x: -step, y: 0 } };
    case "ArrowRight":
      return { type: "move", delta: { x: step, y: 0 } };
    case "ArrowUp":
      return { type: "move", delta: { x: 0, y: -step } };
    case "ArrowDown":
      return { type: "move", delta: { x: 0, y: step } };
    default:
      return null;
  }
}

export function BoundaryNode({ data, selected }: NodeProps<InteractiveBoundaryFlowNode>) {
  return (
    <div className={"architekt-boundary" + (selected ? " architekt-boundary--selected" : "")}>
      <button
        aria-label={"Boundary " + data.name}
        aria-pressed={selected}
        className="architekt-boundary__header"
        onClick={data.onSelect}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const action = getBoundaryKeyboardAction(
            event.key, event.shiftKey, event.altKey, event.ctrlKey, event.metaKey,
          );
          if (!action) return;
          event.preventDefault();
          event.stopPropagation();
          if (action.type === "select") data.onSelect();
          else if (action.type === "delete") data.onDelete();
          else data.onMove(action.delta);
        }}
        title={data.name}
        type="button"
      >
        <span className="architekt-boundary__name">{data.name}</span>
      </button>
    </div>
  );
}
