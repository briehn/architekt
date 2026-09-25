import { Position } from "@xyflow/react";

import type { DiagramAnchorSide, DiagramNodeRectangle } from "./adaptive-anchor-geometry";
import { selectAdaptiveAnchorPair } from "./adaptive-anchor-geometry";
import { resolveDiagramNodeSize } from "./diagram-node-size";
import type {
  ArchitectureFlowEdge,
  ArchitectureFlowNode,
} from "./react-flow-adapter";

export const DIAGRAM_ANCHOR_SIDES = [
  "top",
  "right",
  "bottom",
  "left",
] as const satisfies readonly DiagramAnchorSide[];

export const DIAGRAM_ANCHOR_HANDLES = {
  top: { id: "anchor-top", position: Position.Top },
  right: { id: "anchor-right", position: Position.Right },
  bottom: { id: "anchor-bottom", position: Position.Bottom },
  left: { id: "anchor-left", position: Position.Left },
} as const satisfies Record<
  DiagramAnchorSide,
  Readonly<{ id: string; position: Position }>
>;

export function toDiagramAnchorSide(position: Position): DiagramAnchorSide {
  for (const side of DIAGRAM_ANCHOR_SIDES) {
    if (DIAGRAM_ANCHOR_HANDLES[side].position === position) {
      return side;
    }
  }

  throw new Error(`Unsupported React Flow handle position: ${position}`);
}

function toNodeRectangle(node: ArchitectureFlowNode): DiagramNodeRectangle {
  const measured = node.measured;
  const size = resolveDiagramNodeSize(
    measured?.width !== undefined && measured.height !== undefined
      ? { width: measured.width, height: measured.height }
      : undefined,
  );

  return {
    componentId: node.data.componentId,
    x: node.position.x,
    y: node.position.y,
    width: size.width,
    height: size.height,
  };
}

export function withAdaptiveEdgeAnchors(
  edges: readonly ArchitectureFlowEdge[],
  nodes: readonly ArchitectureFlowNode[],
): ArchitectureFlowEdge[] {
  const rectanglesById = new Map(
    nodes.map((node) => [node.id, toNodeRectangle(node)]),
  );

  return edges.map((edge) => {
    const sourceRect = rectanglesById.get(edge.source);
    const targetRect = rectanglesById.get(edge.target);

    if (!sourceRect || !targetRect) {
      throw new Error(
        `Missing architecture component for derived edge "${edge.id}".`,
      );
    }

    const { sourceSide, targetSide } = selectAdaptiveAnchorPair(
      sourceRect,
      targetRect,
    );

    return {
      ...edge,
      sourceHandle: DIAGRAM_ANCHOR_HANDLES[sourceSide].id,
      targetHandle: DIAGRAM_ANCHOR_HANDLES[targetSide].id,
    };
  });
}
