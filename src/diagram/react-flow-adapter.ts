import {
  type Connection,
  type Dimensions,
  type Edge,
  type EdgeMarker,
  type Node,
  type NodeChange,
} from "@xyflow/react";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  type DiagramNodePositions,
  type DiagramPosition,
  moveDiagramNode,
} from "./diagram-layout";
import type { ArchitectureConnectionIntent } from "./pointer-connection-controller";

const closedArrowMarker = { type: "arrowclosed" } satisfies EdgeMarker;

export type ReactFlowNodeMeasurements = ReadonlyMap<
  string,
  Readonly<Dimensions>
>;

export type ArchitectureFlowNodeData = Readonly<{
  componentId: ArchitectureComponent["id"];
  name: ArchitectureComponent["name"];
  kind: ArchitectureComponentKind;
}>;

export type ArchitectureFlowNode = Node<ArchitectureFlowNodeData>;

export type ArchitectureFlowEdgeData = Readonly<{
  kind: ArchitectureConnectionKind;
}>;

export type ArchitectureFlowEdge = Edge<ArchitectureFlowEdgeData> &
  Readonly<{ data: ArchitectureFlowEdgeData }>;

export function toArchitectureConnection(
  connection: Connection,
  connectionId: ConnectionId,
): ArchitectureConnection {
  return toArchitectureConnectionFromIntent(
    {
      sourceComponentId: connection.source as ComponentId,
      targetComponentId: connection.target as ComponentId,
    },
    connectionId,
  );
}

export function toArchitectureConnectionFromIntent(
  intent: ArchitectureConnectionIntent,
  connectionId: ConnectionId,
): ArchitectureConnection {
  return {
    id: connectionId,
    sourceComponentId: intent.sourceComponentId,
    targetComponentId: intent.targetComponentId,
    kind: "generic",
  };
}

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
  nodes: ArchitectureFlowNode[];
  edges: ArchitectureFlowEdge[];
} {
  const components = graph.getComponents();
  const connections = graph.getConnections();
  const nodes: ArchitectureFlowNode[] = components.map((component) => ({
    id: component.id,
    data: {
      componentId: component.id,
      name: component.name,
      kind: component.kind,
    },
    position: getDiagramPosition(nodePositions, component.id),
  }));

  const edges: ArchitectureFlowEdge[] = connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceComponentId,
    target: connection.targetComponentId,
    markerEnd: closedArrowMarker,
    data: { kind: connection.kind },
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

export function removeReactFlowNodeMeasurement(
  currentMeasurements: ReactFlowNodeMeasurements,
  componentId: ComponentId,
): ReactFlowNodeMeasurements {
  if (!currentMeasurements.has(componentId)) {
    return currentMeasurements;
  }

  const nextMeasurements = new Map(currentMeasurements);
  nextMeasurements.delete(componentId);

  return nextMeasurements;
}

export function withReactFlowNodeMeasurements(
  nodes: readonly ArchitectureFlowNode[],
  measurements: ReactFlowNodeMeasurements,
): ArchitectureFlowNode[] {
  return nodes.map((node) => {
    const measured = measurements.get(node.id);

    return measured ? { ...node, measured } : node;
  });
}
