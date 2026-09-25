import type { ComponentId } from "../domain/identifiers";
import { resolveDiagramNodeSize } from "./diagram-node-size";

export type DiagramAnchorSide = "top" | "right" | "bottom" | "left";

export type DiagramNodeRectangle = Readonly<{
  componentId: ComponentId;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type DiagramAnchorPair = Readonly<{
  sourceSide: DiagramAnchorSide;
  targetSide: DiagramAnchorSide;
}>;

export function selectAdaptiveAnchorPair(
  sourceRect: DiagramNodeRectangle,
  targetRect: DiagramNodeRectangle,
): DiagramAnchorPair {
  const sourceSize = resolveDiagramNodeSize(sourceRect);
  const targetSize = resolveDiagramNodeSize(targetRect);
  const dx =
    targetRect.x + targetSize.width / 2 -
    (sourceRect.x + sourceSize.width / 2);
  const dy =
    targetRect.y + targetSize.height / 2 -
    (sourceRect.y + sourceSize.height / 2);

  if (dx === 0 && dy === 0) {
    // At equal centers, the lower ID exits right and the higher ID exits left.
    return sourceRect.componentId < targetRect.componentId
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }

  const horizontalScore = Math.abs(dx) / (sourceSize.width + targetSize.width);
  const verticalScore = Math.abs(dy) / (sourceSize.height + targetSize.height);

  if (horizontalScore >= verticalScore) {
    return dx > 0
      ? { sourceSide: "right", targetSide: "left" }
      : { sourceSide: "left", targetSide: "right" };
  }

  return dy > 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}
