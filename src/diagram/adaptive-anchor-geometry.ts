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

type SideMidpoint = Readonly<{
  side: DiagramAnchorSide;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}>;

// On equal geometry costs, the physically left rectangle prefers a horizontal side.
const SIDE_PREFERENCE = [
  "right", "left", "bottom", "top",
] as const satisfies readonly DiagramAnchorSide[];

function rectangleCenter(rectangle: DiagramNodeRectangle): readonly [number, number] {
  return [rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2];
}

function comesFirst(
  first: DiagramNodeRectangle,
  second: DiagramNodeRectangle,
): boolean {
  const [firstX, firstY] = rectangleCenter(first);
  const [secondX, secondY] = rectangleCenter(second);
  return firstX !== secondX
    ? firstX < secondX
    : firstY !== secondY
      ? firstY < secondY
      : first.componentId < second.componentId;
}

function sideMidpoints(rectangle: DiagramNodeRectangle): readonly SideMidpoint[] {
  const [centerX, centerY] = rectangleCenter(rectangle);
  return SIDE_PREFERENCE.map((side) => {
    switch (side) {
      case "right":
        return { side, x: rectangle.x + rectangle.width, y: centerY, normalX: 1, normalY: 0 };
      case "left":
        return { side, x: rectangle.x, y: centerY, normalX: -1, normalY: 0 };
      case "bottom":
        return { side, x: centerX, y: rectangle.y + rectangle.height, normalX: 0, normalY: 1 };
      case "top":
        return { side, x: centerX, y: rectangle.y, normalX: 0, normalY: -1 };
    }
  });
}

function fallbackNormalizedAxisPair(
  first: DiagramNodeRectangle,
  second: DiagramNodeRectangle,
): DiagramAnchorPair {
  const [firstX, firstY] = rectangleCenter(first);
  const [secondX, secondY] = rectangleCenter(second);
  const dx = secondX - firstX;
  const dy = secondY - firstY;

  if (dx === 0 && dy === 0) {
    return { sourceSide: "right", targetSide: "left" };
  }

  const horizontalScore = Math.abs(dx) / (first.width + second.width);
  const verticalScore = Math.abs(dy) / (first.height + second.height);
  if (horizontalScore >= verticalScore) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return dy > 0
    ? { sourceSide: "bottom", targetSide: "top" }
    : { sourceSide: "top", targetSide: "bottom" };
}

function lowestCostPair(
  first: DiagramNodeRectangle,
  second: DiagramNodeRectangle,
): DiagramAnchorPair | null {
  const firstSides = sideMidpoints(first);
  const secondSides = sideMidpoints(second);
  let best: Readonly<{
    pair: DiagramAnchorPair;
    cost: number;
    distance: number;
    preference: number;
  }> | null = null;

  for (const [firstIndex, firstSide] of firstSides.entries()) {
    for (const [secondIndex, secondSide] of secondSides.entries()) {
      const dx = secondSide.x - firstSide.x;
      const dy = secondSide.y - firstSide.y;
      const firstProjection = dx * firstSide.normalX + dy * firstSide.normalY;
      const secondProjection = -dx * secondSide.normalX - dy * secondSide.normalY;
      if (firstProjection <= 0 || secondProjection <= 0) continue;

      const distance = Math.hypot(dx, dy);
      // Each projection deficit measures how far a handle points across the chord.
      const cost = 3 * distance - (firstProjection + secondProjection);
      const preference = firstIndex * SIDE_PREFERENCE.length + secondIndex;
      if (
        best === null || cost < best.cost ||
        (cost === best.cost && (
          distance < best.distance ||
          (distance === best.distance && preference < best.preference)
        ))
      ) {
        best = {
          pair: { sourceSide: firstSide.side, targetSide: secondSide.side },
          cost,
          distance,
          preference,
        };
      }
    }
  }

  return best?.pair ?? null;
}

export function selectAdaptiveAnchorPair(
  sourceRect: DiagramNodeRectangle,
  targetRect: DiagramNodeRectangle,
): DiagramAnchorPair {
  const source = { ...sourceRect, ...resolveDiagramNodeSize(sourceRect) };
  const target = { ...targetRect, ...resolveDiagramNodeSize(targetRect) };
  const sourceIsFirst = comesFirst(source, target);
  const first = sourceIsFirst ? source : target;
  const second = sourceIsFirst ? target : source;
  const pair = lowestCostPair(first, second) ?? fallbackNormalizedAxisPair(first, second);

  return sourceIsFirst
    ? pair
    : { sourceSide: pair.targetSide, targetSide: pair.sourceSide };
}
