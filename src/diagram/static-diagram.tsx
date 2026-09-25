"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  useReactFlow,
  type Node,
  type OnConnect,
  type OnNodeDrag,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";

import type { ComponentId } from "../domain/identifiers";
import {
  ANCHOR_KEYBOARD_INSTRUCTIONS,
  ANCHOR_KEYBOARD_INSTRUCTIONS_ID,
} from "./anchor-keyboard-interaction";
import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";
import { withAdaptiveEdgeAnchors } from "./adaptive-anchor-renderer";
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
import type { PendingPointerConnectionSource } from "./pointer-connection-controller";
import {
  ReciprocalArchitectureEdge,
  withReciprocalEdgeTypes,
} from "./reciprocal-edge-renderer";

const nodeTypes = { architekt: ArchitektNode };
const edgeTypes = { reciprocal: ReciprocalArchitectureEdge };
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

export const AUTO_LAYOUT_FIT_VIEW_PADDING = 0.15;

type AutoLayoutFitViewApi = Pick<ReactFlowInstance, "fitView">;

export function consumeAutoLayoutFitViewRequest(
  requestId: number,
  mostRecentRequestId: number,
  reactFlow: AutoLayoutFitViewApi,
): number {
  if (requestId <= mostRecentRequestId) {
    return mostRecentRequestId;
  }

  void reactFlow.fitView({ padding: AUTO_LAYOUT_FIT_VIEW_PADDING });
  return requestId;
}

function AutoLayoutFitViewRequest({
  requestId,
}: Readonly<{ requestId: number }>) {
  const reactFlow = useReactFlow();
  const mostRecentRequestId = useRef(0);

  useEffect(() => {
    mostRecentRequestId.current = consumeAutoLayoutFitViewRequest(
      requestId,
      mostRecentRequestId.current,
      reactFlow,
    );
  }, [reactFlow, requestId]);

  return null;
}

export function requestComponentRenameFromNode(
  node: Pick<Node, "id">,
  onNodeRenameRequested: (componentId: ComponentId) => void,
): void {
  onNodeRenameRequested(node.id as ComponentId);
}

type StaticDiagramProps = {
  nodes: ArchitectureFlowNode[];
  edges: ArchitectureFlowEdge[];
  selectedComponentIds?: ReadonlySet<ComponentId>;
  onSelectedNodesDelete?(componentIds: readonly ComponentId[]): void;
  canDeleteSelectedNodes?(): boolean;
  onConnect: OnConnect;
  onNodeDragStart: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  onNodesChange: OnNodesChange;
  canvasRename: CanvasRenamePresentation | null;
  activeRenameComponentId?: ComponentId | null;
  canvasNodeFocusRequest: CanvasNodeFocusRequest | null;
  autoLayoutFitRequestId: number;
  pendingPointerConnectionSource?: PendingPointerConnectionSource | null;
  onPointerAnchorActivated?(componentId: ComponentId, side: DiagramAnchorSide): void;
  onPointerConnectionCancelled?(): void;
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
  selectedComponentIds = new Set(),
  onSelectedNodesDelete,
  canDeleteSelectedNodes,
  onConnect,
  onNodeDragStart,
  onNodeDragStop,
  onNodesChange,
  canvasRename,
  activeRenameComponentId = null,
  canvasNodeFocusRequest,
  autoLayoutFitRequestId,
  pendingPointerConnectionSource = null,
  onPointerAnchorActivated,
  onPointerConnectionCancelled,
  onNodeRenameRequested,
}: StaticDiagramProps) {
  const nativeConnectionDragStarted = useRef(false);
  const nameCounts = new Map<string, number>();
  for (const node of nodes) {
    nameCounts.set(node.data.name, (nameCounts.get(node.data.name) ?? 0) + 1);
  }
  const pendingSourceNode = nodes.find(
    (node) => node.id === pendingPointerConnectionSource?.componentId,
  );
  const pendingSourceAccessibleName = pendingSourceNode
    ? getAccessibleEndpointName(pendingSourceNode, nameCounts)
    : null;

  function handleAnchorPointerDown() {
    nativeConnectionDragStarted.current = false;
  }

  function handleAnchorClick(componentId: ComponentId, side: DiagramAnchorSide) {
    if (!nativeConnectionDragStarted.current) {
      onPointerAnchorActivated?.(componentId, side);
    }
  }

  function handleConnectStart() {
    nativeConnectionDragStarted.current = true;
    onPointerConnectionCancelled?.();
  }

  const architektNodes: ArchitektFlowNode[] = nodes.map((node) => ({
    ...node,
    selected: selectedComponentIds.has(node.data.componentId),
    connectable: node.connectable !== false && node.id !== activeRenameComponentId,
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
      pointerConnection: {
        accessibleComponentName: getAccessibleEndpointName(node, nameCounts),
        pendingSourceAccessibleName,
        pendingSourceSide:
          pendingPointerConnectionSource?.componentId === node.id
            ? pendingPointerConnectionSource.side
            : null,
        destinationAvailable:
          pendingPointerConnectionSource !== null &&
          pendingPointerConnectionSource.componentId !== node.id,
        onAnchorPointerDown: handleAnchorPointerDown,
        onAnchorClick: (side) => handleAnchorClick(node.data.componentId, side),
        onAnchorActivate: (side) =>
          onPointerAnchorActivated?.(node.data.componentId, side),
      },
    },
  }));
  const architektEdges = withReciprocalEdgeTypes(
    withArchitectureEdgePresentation(
      withAdaptiveEdgeAnchors(edges, nodes),
      nodes,
    ),
  ).map((edge) => ({ ...edge, selectable: false, deletable: false }));

  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <p className="sr-only" id={ANCHOR_KEYBOARD_INSTRUCTIONS_ID}>
        {ANCHOR_KEYBOARD_INSTRUCTIONS}
      </p>
      <ReactFlow
        nodes={architektNodes}
        edges={architektEdges}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onPaneClick={onPointerConnectionCancelled}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onNodesDelete={(deletedNodes) =>
          onSelectedNodesDelete?.(
            deletedNodes.map((node) => node.data.componentId),
          )
        }
        onBeforeDelete={async ({ nodes: nodesToDelete, edges: edgesToDelete }) =>
          nodesToDelete.length > 0 && (canDeleteSelectedNodes?.() ?? true)
            ? { nodes: nodesToDelete, edges: edgesToDelete }
            : false
        }
        onNodeDoubleClick={(_event, node) =>
          requestComponentRenameFromNode(node, onNodeRenameRequested)
        }
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        nodesDraggable
        nodesConnectable
        connectionMode={ConnectionMode.Loose}
        connectionDragThreshold={5}
        connectOnClick={false}
        elementsSelectable
        deleteKeyCode={["Delete", "Backspace"]}
        edgesReconnectable={false}
      >
        <AutoLayoutFitViewRequest requestId={autoLayoutFitRequestId} />
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
