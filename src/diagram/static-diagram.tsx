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

type StaticDiagramProps = {
  nodes: Node[];
  edges: Edge[];
  onConnect: OnConnect;
  onNodeDragStart: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  onNodesChange: OnNodesChange;
};

export function StaticDiagram({
  nodes,
  edges,
  onConnect,
  onNodeDragStart,
  onNodeDragStop,
  onNodesChange,
}: StaticDiagramProps) {
  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
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
