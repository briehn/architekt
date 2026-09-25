import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";

type ReciprocalEdgeEndpoints = Readonly<{
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceSide: DiagramAnchorSide;
  targetSide: DiagramAnchorSide;
}>;

type ReciprocalEdgePath = Readonly<{
  path: string;
  labelX: number;
  labelY: number;
}>;

function outwardDirection(side: DiagramAnchorSide): readonly [number, number] {
  switch (side) {
    case "top":
      return [0, -1];
    case "right":
      return [1, 0];
    case "bottom":
      return [0, 1];
    case "left":
      return [-1, 0];
  }
}

export function getReciprocalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceSide,
  targetSide,
}: ReciprocalEdgeEndpoints): ReciprocalEdgePath {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);
  const [sourceOutX, sourceOutY] = outwardDirection(sourceSide);
  const [targetOutX, targetOutY] = outwardDirection(targetSide);

  // At coincident or nearly coincident endpoints, the source handle gives the
  // chord a stable direction. Opposing handles reverse it for the reverse edge.
  const chordX = distance > 0.000001 ? dx / distance : sourceOutX;
  const chordY = distance > 0.000001 ? dy / distance : sourceOutY;
  const laneOffset = Math.min(28, Math.max(16, distance * 0.12));
  const endpointLead = Math.min(36, Math.max(6, distance / 3));
  const normalX = -chordY;
  const normalY = chordX;
  const firstControlX = sourceX + sourceOutX * endpointLead + normalX * laneOffset;
  const firstControlY = sourceY + sourceOutY * endpointLead + normalY * laneOffset;
  const secondControlX = targetX + targetOutX * endpointLead + normalX * laneOffset;
  const secondControlY = targetY + targetOutY * endpointLead + normalY * laneOffset;

  // The label follows the cubic at t=0.5; reversing the chord reverses its lane.
  const labelX = (sourceX + 3 * firstControlX + 3 * secondControlX + targetX) / 8;
  const labelY = (sourceY + 3 * firstControlY + 3 * secondControlY + targetY) / 8;

  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${firstControlX},${firstControlY}`,
    `${secondControlX},${secondControlY}`,
    `${targetX},${targetY}`,
  ].join(" ");

  return { path, labelX, labelY };
}
