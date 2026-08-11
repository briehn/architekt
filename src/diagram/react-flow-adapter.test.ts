import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { toReactFlowDiagram } from "./react-flow-adapter";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function component(id: string, name: string): ArchitectureComponent {
  return { id: componentId(id), name };
}

function connection(
  id: string,
  sourceComponentId: ComponentId,
  targetComponentId: ComponentId,
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId,
    targetComponentId,
  };
}

function addComponent(
  graph: ArchitectureGraph,
  architectureComponent: ArchitectureComponent,
): ArchitectureGraph {
  const result = graph.addComponent(architectureComponent);

  if (!result.ok) {
    throw new Error("Expected component to be added to the graph.");
  }

  return result.graph;
}

function addConnection(
  graph: ArchitectureGraph,
  architectureConnection: ArchitectureConnection,
): ArchitectureGraph {
  const result = graph.addConnection(architectureConnection);

  if (!result.ok) {
    throw new Error("Expected connection to be added to the graph.");
  }

  return result.graph;
}

describe("toReactFlowDiagram", () => {
  it("maps an empty graph to empty React Flow collections", () => {
    expect(toReactFlowDiagram(ArchitectureGraph.empty())).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("maps component IDs, names, and deterministic positions to nodes", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);

    const expectedNodes: Node[] = [
      {
        id: "api",
        position: { x: 0, y: 0 },
        data: { label: "API" },
      },
      {
        id: "database",
        position: { x: 240, y: 0 },
        data: { label: "Database" },
      },
    ];

    expect(toReactFlowDiagram(graph).nodes).toEqual(expectedNodes);
  });

  it("maps connection identity and directional endpoints to edges", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);
    graph = addConnection(
      graph,
      connection("api-to-database", api.id, database.id),
    );
    graph = addConnection(
      graph,
      connection("database-to-api", database.id, api.id),
    );

    const expectedEdges: Edge[] = [
      { id: "api-to-database", source: "api", target: "database" },
      { id: "database-to-api", source: "database", target: "api" },
    ];

    expect(toReactFlowDiagram(graph).edges).toEqual(expectedEdges);
  });

  it("is deterministic and does not change the domain graph", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);
    graph = addConnection(
      graph,
      connection("api-to-database", api.id, database.id),
    );

    const firstDiagram = toReactFlowDiagram(graph);
    const secondDiagram = toReactFlowDiagram(graph);

    expect(firstDiagram).toEqual(secondDiagram);
    expect(graph.getComponents()).toEqual([api, database]);
    expect(graph.getConnections()).toEqual([
      connection("api-to-database", api.id, database.id),
    ]);
  });
});
