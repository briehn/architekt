"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Edge,
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

const nodeTypes = { architekt: ArchitektNode };

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
  nodes: Node[];
  edges: Edge[];
  onConnect: OnConnect;
  onNodeDragStart: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  onNodesChange: OnNodesChange;
  canvasRename: CanvasRenamePresentation | null;
  canvasNodeFocusRequest: CanvasNodeFocusRequest | null;
  onNodeRenameRequested(componentId: ComponentId): void;
};

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
    type: "architekt",
    data: {
      label: node.data.label as string,
      rename:
        canvasRename?.componentId === node.id ? canvasRename : null,
      focusRequestId:
        canvasNodeFocusRequest?.componentId === node.id
          ? canvasNodeFocusRequest.requestId
          : null,
    },
  }));

  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <ReactFlow
        nodes={architektNodes}
        edges={edges}
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
