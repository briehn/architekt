import { type Edge, type EdgeMarker, type Node } from "@xyflow/react";

import type { ArchitectureGraph } from "../domain/architecture-graph";

const closedArrowMarker = { type: "arrowclosed" } satisfies EdgeMarker;

export function toReactFlowDiagram(graph: ArchitectureGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  const components = graph.getComponents();
  const connections = graph.getConnections();
  const nodes: Node[] = components.map((component, index) => ({
    id: component.id,
    data: {
      label: component.name,
    },
    position: { x: index * 240, y: 0 }, // Placeholder position; should be updated with actual layout logic.
  }));

  const edges: Edge[] = connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceComponentId,
    target: connection.targetComponentId,
    markerEnd: closedArrowMarker,
  }));

  return { nodes, edges };
}
