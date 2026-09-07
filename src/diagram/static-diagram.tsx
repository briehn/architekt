"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Edge,
  type Node,
  type OnConnect,
  type OnNodesChange,
} from "@xyflow/react";

type StaticDiagramProps = {
  nodes: Node[];
  edges: Edge[];
  onConnect: OnConnect;
  onNodesChange: OnNodesChange;
};

export function StaticDiagram({
  nodes,
  edges,
  onConnect,
  onNodesChange,
}: StaticDiagramProps) {
  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
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