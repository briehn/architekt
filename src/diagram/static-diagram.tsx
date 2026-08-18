"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";

type StaticDiagramProps = {
  nodes: Node[];
  edges: Edge[];
};

export function StaticDiagram({ nodes, edges }: StaticDiagramProps) {
  return (
    <div className="architekt-diagram h-full min-h-0 w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
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
