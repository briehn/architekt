import type { ArchitectureBoundary } from "../domain/architecture-boundary";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import type { DiagramNodePositions } from "./diagram-layout";
import { resolveDiagramNodeSize, type DiagramNodeSizes } from "./diagram-node-size";

export const BOUNDARY_HORIZONTAL_PADDING = 24;
export const BOUNDARY_BOTTOM_PADDING = 24;
export const BOUNDARY_HEADER_HEIGHT = 32;
export const BOUNDARY_HEADER_GAP = 24;
export const BOUNDARY_MIN_WIDTH = 240;
export const BOUNDARY_MIN_HEIGHT = 160;

export type BoundaryRectangle = Readonly<{
  boundaryId: BoundaryId;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function deriveBoundaryRectangle(
  boundary: ArchitectureBoundary,
  nodePositions: DiagramNodePositions,
  knownNodeSizes: DiagramNodeSizes,
): BoundaryRectangle | null {
  if (boundary.memberComponentIds.length === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const memberId of boundary.memberComponentIds) {
    const position = nodePositions.get(memberId);
    if (!position) {
      throw new Error("Missing diagram position for boundary member.");
    }
    const size = resolveDiagramNodeSize(knownNodeSizes.get(memberId));
    left = Math.min(left, position.x);
    top = Math.min(top, position.y);
    right = Math.max(right, position.x + size.width);
    bottom = Math.max(bottom, position.y + size.height);
  }

  const x = left - BOUNDARY_HORIZONTAL_PADDING;
  const y = top - BOUNDARY_HEADER_HEIGHT - BOUNDARY_HEADER_GAP;
  return {
    boundaryId: boundary.id,
    name: boundary.name,
    x,
    y,
    width: Math.max(BOUNDARY_MIN_WIDTH, right - x + BOUNDARY_HORIZONTAL_PADDING),
    height: Math.max(BOUNDARY_MIN_HEIGHT, bottom - y + BOUNDARY_BOTTOM_PADDING),
  };
}

export function deriveBoundaryRectangles(
  graph: ArchitectureGraph,
  nodePositions: DiagramNodePositions,
  knownNodeSizes: DiagramNodeSizes,
): readonly BoundaryRectangle[] {
  return graph.getBoundaries().flatMap((boundary) => {
    const rectangle = deriveBoundaryRectangle(boundary, nodePositions, knownNodeSizes);
    return rectangle ? [rectangle] : [];
  });
}
