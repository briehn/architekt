import {
  type Dimensions,
  type Edge,
  type EdgeMarker,
  type Node,
  type NodeChange,
} from "@xyflow/react";

import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  type DiagramNodePositions,
  type DiagramPosition,
  moveDiagramNode,
} from "./diagram-layout";

const closedArrowMarker = { type: "arrowclosed" } satisfies EdgeMarker;

export type ReactFlowNodeMeasurements = ReadonlyMap<
  string,
  Readonly<Dimensions>
>;

function getDiagramPosition(
  nodePositions: DiagramNodePositions,
  componentId: ComponentId,
): DiagramPosition {
  const position = nodePositions.get(componentId);

  if (!position) {
    throw new Error(
      `Missing diagram position for architecture component "${componentId}".`,
    );
  }

  return position;
}

export function toReactFlowDiagram(
  graph: ArchitectureGraph,
  nodePositions: DiagramNodePositions,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const components = graph.getComponents();
  const connections = graph.getConnections();
  const nodes: Node[] = components.map((component) => ({
    id: component.id,
    data: {
      label: component.name,
    },
    position: getDiagramPosition(nodePositions, component.id),
  }));

  const edges: Edge[] = connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceComponentId,
    target: connection.targetComponentId,
    markerEnd: closedArrowMarker,
  }));

  return { nodes, edges };
}

export function applyReactFlowNodePositionChanges(
  currentPositions: DiagramNodePositions,
  changes: readonly NodeChange[],
): DiagramNodePositions {
  let nextPositions = currentPositions;

  for (const change of changes) {
    if (change.type !== "position" || !change.position) {
      continue;
    }

    const componentId = Array.from(nextPositions.keys()).find(
      (existingComponentId) => existingComponentId === change.id,
    );

    if (!componentId) {
      continue;
    }

    nextPositions = moveDiagramNode(
      nextPositions,
      componentId,
      change.position,
    );
  }

  return nextPositions;
}

export function applyReactFlowNodeMeasurementChanges(
  currentMeasurements: ReactFlowNodeMeasurements,
  changes: readonly NodeChange[],
): ReactFlowNodeMeasurements {
  let nextMeasurements: Map<string, Readonly<Dimensions>> | undefined;

  for (const change of changes) {
    if (change.type !== "dimensions" || !change.dimensions) {
      continue;
    }

    nextMeasurements ??= new Map(currentMeasurements);
    nextMeasurements.set(change.id, {
      width: change.dimensions.width,
      height: change.dimensions.height,
    });
  }

  return nextMeasurements ?? currentMeasurements;
}

export function withReactFlowNodeMeasurements(
  nodes: readonly Node[],
  measurements: ReactFlowNodeMeasurements,
): Node[] {
  return nodes.map((node) => {
    const measured = measurements.get(node.id);

    return measured ? { ...node, measured } : node;
  });
}
