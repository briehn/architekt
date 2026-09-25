import { getBezierPath, Position } from "@xyflow/react";

type ReciprocalEdgeEndpoints = Readonly<{
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}>;

type ReciprocalEdgePath = Readonly<{
  path: string;
  labelX: number;
  labelY: number;
}>;

function outwardDirection(position: Position): readonly [number, number] {
  switch (position) {
    case Position.Top:
      return [0, -1];
    case Position.Right:
      return [1, 0];
    case Position.Bottom:
      return [0, 1];
    case Position.Left:
      return [-1, 0];
  }
}

export function getReciprocalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: ReciprocalEdgeEndpoints): ReciprocalEdgePath {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);
  const [sourceOutX, sourceOutY] = outwardDirection(sourcePosition);
  const chordX = distance > 0 ? dx / distance : sourceOutX;
  const chordY = distance > 0 ? dy / distance : sourceOutY;
  const [path, centerX, centerY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Direction reverses the chord normal, separating labels without moving the stroke.
  const labelOffset = 18;
  return {
    path,
    labelX: centerX - chordY * labelOffset,
    labelY: centerY + chordX * labelOffset,
  };
}
