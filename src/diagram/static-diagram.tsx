"use client";

import type { CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Node,
  type OnConnect,
  type OnNodeDrag,
  type OnNodesChange,
} from "@xyflow/react";

import type { ComponentId } from "../domain/identifiers";
import {
  ArchitektNode,
  type ArchitektFlowNode,
  type CanvasRenamePresentation,
} from "./architekt-node";
import { getArchitectureNodeAccessibleLabel } from "./component-kind-presentation";
import {
  getArchitectureEdgeAccessibleLabel,
  getConnectionKindPresentation,
} from "./connection-kind-presentation";
import type {
  ArchitectureFlowEdge,
  ArchitectureFlowNode,
} from "./react-flow-adapter";

const nodeTypes = { architekt: ArchitektNode };
const semanticEdgeLabelStyle = {
  fill: "var(--text-secondary)",
  fontSize: 12,
  fontWeight: 600,
} satisfies CSSProperties;
const semanticEdgeLabelBackgroundStyle = {
  fill: "var(--surface)",
  stroke: "var(--border)",
  strokeWidth: 1,
} satisfies CSSProperties;

export type CanvasNodeFocusRequest = Readonly<{
  componentId: ComponentId;
  requestId: number;
}>;

export function requestComponentRenameFromNode(
  node: Pick<Node, "id">,
  onNodeRenameRequested: (componentId: ComponentId) => void,
): void {
  onNodeRenameRequested(node.id as ComponentId);
}

type StaticDiagramProps = {
  nodes: ArchitectureFlowNode[];
  edges: ArchitectureFlowEdge[];
  onConnect: OnConnect;
  onNodeDragStart: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  onNodesChange: OnNodesChange;
  canvasRename: CanvasRenamePresentation | null;
  canvasNodeFocusRequest: CanvasNodeFocusRequest | null;
  onNodeRenameRequested(componentId: ComponentId): void;
};

function getAccessibleEndpointName(
  node: ArchitectureFlowNode,
  nameCounts: ReadonlyMap<string, number>,
): string {
  return nameCounts.get(node.data.name) === 1
    ? node.data.name
    : `${node.data.name} (${node.data.componentId})`;
}

export function withArchitectureEdgePresentation(
  edges: readonly ArchitectureFlowEdge[],
  nodes: readonly ArchitectureFlowNode[],
): ArchitectureFlowEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nameCounts = new Map<string, number>();

  for (const node of nodes) {
    nameCounts.set(node.data.name, (nameCounts.get(node.data.name) ?? 0) + 1);
  }

  return edges.map((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);

    if (!sourceNode || !targetNode) {
      throw new Error(
        `Missing architecture component for derived edge "${edge.id}".`,
      );
    }

    const presentation = getConnectionKindPresentation(edge.data.kind);
    const visibleLabel = presentation.visibleLabel;

    return {
      ...edge,
      label: visibleLabel ?? undefined,
      labelShowBg: visibleLabel !== null,
      ...(visibleLabel === null
        ? {}
        : {
            labelStyle: semanticEdgeLabelStyle,
            labelBgStyle: semanticEdgeLabelBackgroundStyle,
            labelBgPadding: [2, 4] as [number, number],
            labelBgBorderRadius: 4,
          }),
      ariaLabel: getArchitectureEdgeAccessibleLabel(
        getAccessibleEndpointName(sourceNode, nameCounts),
        getAccessibleEndpointName(targetNode, nameCounts),
        edge.data.kind,
      ),
    };
  });
}

export function StaticDiagram({
  nodes,
  edges,
  onConnect,
  onNodeDragStart,
  onNodeDragStop,
  onNodesChange,
  canvasRename,
  canvasNodeFocusRequest,
  onNodeRenameRequested,
}: StaticDiagramProps) {
  const architektNodes: ArchitektFlowNode[] = nodes.map((node) => ({
    ...node,
    ariaLabel: getArchitectureNodeAccessibleLabel(
      node.data.name,
      node.data.kind,
    ),
    type: "architekt",
    data: {
      componentId: node.data.componentId,
      name: node.data.name,
      kind: node.data.kind,
      rename:
        canvasRename?.componentId === node.id ? canvasRename : null,
      focusRequestId:
        canvasNodeFocusRequest?.componentId === node.id
          ? canvasNodeFocusRequest.requestId
          : null,
    },
  }));
  const architektEdges = withArchitectureEdgePresentation(edges, nodes);

  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <ReactFlow
        nodes={architektNodes}
        edges={architektEdges}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onNodeDoubleClick={(_event, node) =>
          requestComponentRenameFromNode(node, onNodeRenameRequested)
        }
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable
        connectionMode={ConnectionMode.Strict}
        elementsSelectable={false}
        edgesReconnectable={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          bgColor="var(--canvas)"
          color="var(--border)"
          className="architekt-diagram__background"
        />
      </ReactFlow>
    </div>
  );
}
