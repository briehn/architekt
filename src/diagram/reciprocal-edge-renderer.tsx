import { BaseEdge, type EdgeProps } from "@xyflow/react";

import type { ArchitectureFlowEdge } from "./react-flow-adapter";
import { getReciprocalEdgePath } from "./reciprocal-edge-geometry";

export const RECIPROCAL_EDGE_TYPE = "reciprocal";

export function withReciprocalEdgeTypes(
  edges: readonly ArchitectureFlowEdge[],
): ArchitectureFlowEdge[] {
  const targetsBySource = new Map<string, Set<string>>();

  for (const edge of edges) {
    let targets = targetsBySource.get(edge.source);
    if (!targets) {
      targets = new Set<string>();
      targetsBySource.set(edge.source, targets);
    }
    targets.add(edge.target);
  }

  return edges.map((edge) =>
    edge.source !== edge.target &&
    targetsBySource.get(edge.target)?.has(edge.source)
      ? { ...edge, type: RECIPROCAL_EDGE_TYPE }
      : edge,
  );
}

export function ReciprocalArchitectureEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps<ArchitectureFlowEdge>) {
  const { path, labelX, labelY } = getReciprocalEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      path={path}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  );
}
