"use client";

import { ReactFlow, type Edge, type Node } from "@xyflow/react";

type StaticDiagramProps = {
  nodes: Node[];
  edges: Edge[];
};

export function StaticDiagram({nodes, edges} : StaticDiagramProps) {
  return (
    <div className="h-150 w-full">
      <ReactFlow nodes={nodes} edges={edges} />
    </div>
  );
}
