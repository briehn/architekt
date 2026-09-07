"use client";

import { useState } from "react";
import type { NodeChange } from "@xyflow/react";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  applyReactFlowNodeChangesToEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
} from "./architecture-editor-state";
import {
  toReactFlowDiagram,
  withReactFlowNodeMeasurements,
} from "./react-flow-adapter";
import { StaticDiagram } from "./static-diagram";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function createExampleArchitectureGraph(): ArchitectureGraph {
  const graph = ArchitectureGraph.empty();
  const api = { id: componentId("api"), name: "API" };
  const database = { id: componentId("database"), name: "Database" };
  const apiToDatabase = {
    id: connectionId("api-to-database"),
    sourceComponentId: api.id,
    targetComponentId: database.id,
  };

  const apiResult = graph.addComponent(api);
  if (!apiResult.ok) return graph;

  const databaseResult = apiResult.graph.addComponent(database);
  if (!databaseResult.ok) return graph;

  const connectionResult = databaseResult.graph.addConnection(apiToDatabase);
  return connectionResult.ok ? connectionResult.graph : graph;
}

// This module-level value remains stable when position state causes a re-render.
const exampleArchitectureGraph = createExampleArchitectureGraph();

export function ArchitectureEditor() {
  const [editorState, setEditorState] = useState<ArchitectureEditorState>(() =>
    createArchitectureEditorState(exampleArchitectureGraph),
  );
  const { nodes: diagramNodes, edges } = toReactFlowDiagram(
    editorState.graph,
    editorState.nodePositions,
  );
  const nodes = withReactFlowNodeMeasurements(
    diagramNodes,
    editorState.nodeMeasurements,
  );

  function handleNodesChange(changes: NodeChange[]) {
    setEditorState((currentState) =>
      applyReactFlowNodeChangesToEditorState(currentState, changes),
    );
  }

  return (
    <StaticDiagram
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
    />
  );
}
