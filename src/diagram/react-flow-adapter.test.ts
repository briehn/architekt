import {
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import type { DiagramNodePositions } from "./diagram-layout";
import {
  applyReactFlowNodeMeasurementChanges,
  applyReactFlowNodePositionChanges,
  removeReactFlowNodeMeasurement,
  type ReactFlowNodeMeasurements,
  toArchitectureConnection,
  toReactFlowDiagram,
  withReactFlowNodeMeasurements,
} from "./react-flow-adapter";

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

function nodePositions(
  ...entries: ReadonlyArray<
    readonly [ComponentId, Readonly<{ x: number; y: number }>]
  >
): DiagramNodePositions {
  return new Map(entries);
}

function nodeMeasurements(
  ...entries: ReadonlyArray<
    readonly [string, Readonly<{ width: number; height: number }>]
  >
): ReactFlowNodeMeasurements {
  return new Map(entries);
}

describe("toArchitectureConnection", () => {
  it("translates renderer endpoints with an application-provided ID", () => {
    const rendererConnection: Connection = {
      source: "api",
      target: "database",
      sourceHandle: "source-handle",
      targetHandle: "target-handle",
    };
    const generatedConnectionId = connectionId("generated-connection");

    expect(
      toArchitectureConnection(
        rendererConnection,
        generatedConnectionId,
      ),
    ).toEqual({
      id: generatedConnectionId,
      sourceComponentId: componentId("api"),
      targetComponentId: componentId("database"),
    });
  });
});

describe("toReactFlowDiagram", () => {
  it("maps an empty graph to empty React Flow collections", () => {
    expect(
      toReactFlowDiagram(ArchitectureGraph.empty(), new Map()),
    ).toEqual({ nodes: [], edges: [] });
  });

  it("maps component IDs, names, and supplied positions to nodes", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);

    const positions = nodePositions(
      [api.id, { x: 96, y: 64 }],
      [database.id, { x: -120, y: 200 }],
    );
    const expectedNodes: Node[] = [
      {
        id: "api",
        position: { x: 96, y: 64 },
        data: { label: "API" },
      },
      {
        id: "database",
        position: { x: -120, y: 200 },
        data: { label: "Database" },
      },
    ];

    expect(toReactFlowDiagram(graph, positions).nodes).toEqual(
      expectedNodes,
    );
  });

  it("rejects a graph component without a diagram position", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);

    expect(() =>
      toReactFlowDiagram(
        graph,
        nodePositions([api.id, { x: 0, y: 0 }]),
      ),
    ).toThrow(
      'Missing diagram position for architecture component "database".',
    );
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
    const positions = nodePositions(
      [api.id, { x: 0, y: 0 }],
      [database.id, { x: 240, y: 0 }],
    );

    const expectedEdges: Edge[] = [
      {
        id: "api-to-database",
        source: "api",
        target: "database",
        markerEnd: { type: "arrowclosed" },
      },
      {
        id: "database-to-api",
        source: "database",
        target: "api",
        markerEnd: { type: "arrowclosed" },
      },
    ];

    expect(toReactFlowDiagram(graph, positions).edges).toEqual(
      expectedEdges,
    );
  });

  it("is deterministic and does not change its canonical inputs", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    let graph = ArchitectureGraph.empty();

    graph = addComponent(graph, api);
    graph = addComponent(graph, database);
    graph = addConnection(
      graph,
      connection("api-to-database", api.id, database.id),
    );
    const positions = nodePositions(
      [api.id, { x: 0, y: 0 }],
      [database.id, { x: 240, y: 0 }],
    );

    const firstDiagram = toReactFlowDiagram(graph, positions);
    const secondDiagram = toReactFlowDiagram(graph, positions);

    expect(firstDiagram).toEqual(secondDiagram);
    expect(graph.getComponents()).toEqual([api, database]);
    expect(graph.getConnections()).toEqual([
      connection("api-to-database", api.id, database.id),
    ]);
    expect(positions).toEqual(
      nodePositions(
        [api.id, { x: 0, y: 0 }],
        [database.id, { x: 240, y: 0 }],
      ),
    );
  });
});

describe("applyReactFlowNodePositionChanges", () => {
  const apiId = componentId("api");
  const databaseId = componentId("database");

  function initialPositions(): DiagramNodePositions {
    return nodePositions(
      [apiId, { x: 0, y: 0 }],
      [databaseId, { x: 240, y: 0 }],
    );
  }

  it("translates a position change into immutable diagram state", () => {
    const previousPositions = initialPositions();
    const changes: NodeChange[] = [
      {
        id: apiId,
        type: "position",
        position: { x: 120, y: 80 },
        dragging: true,
      },
    ];

    const nextPositions = applyReactFlowNodePositionChanges(
      previousPositions,
      changes,
    );

    expect(nextPositions).not.toBe(previousPositions);
    expect(nextPositions).toEqual(
      nodePositions(
        [apiId, { x: 120, y: 80 }],
        [databaseId, { x: 240, y: 0 }],
      ),
    );
    expect(previousPositions).toEqual(initialPositions());
  });

  it("ignores changes outside node-position ownership", () => {
    const previousPositions = initialPositions();
    const ignoredChanges: NodeChange[] = [
      {
        id: apiId,
        type: "dimensions",
        dimensions: { width: 180, height: 48 },
      },
      { id: apiId, type: "select", selected: true },
      { id: apiId, type: "remove" },
      {
        type: "add",
        item: {
          id: "added",
          position: { x: 10, y: 10 },
          data: {},
        },
      },
      {
        id: apiId,
        type: "replace",
        item: {
          id: apiId,
          position: { x: 10, y: 10 },
          data: {},
        },
      },
      {
        id: apiId,
        type: "position",
        positionAbsolute: { x: 500, y: 500 },
        dragging: true,
      },
      {
        id: "missing",
        type: "position",
        position: { x: 120, y: 80 },
      },
    ];

    const nextPositions = applyReactFlowNodePositionChanges(
      previousPositions,
      ignoredChanges,
    );

    expect(nextPositions).toBe(previousPositions);
  });
});

describe("React Flow node measurements", () => {
  it("removes a known measurement without changing previous renderer state", () => {
    const apiId = componentId("api");
    const databaseId = componentId("database");
    const databaseMeasurement = { width: 176, height: 48 };
    const previousMeasurements = nodeMeasurements(
      [apiId, { width: 204, height: 56 }],
      [databaseId, databaseMeasurement],
    );

    const nextMeasurements = removeReactFlowNodeMeasurement(
      previousMeasurements,
      apiId,
    );

    expect(nextMeasurements).not.toBe(previousMeasurements);
    expect(nextMeasurements).toEqual(
      nodeMeasurements([databaseId, { width: 176, height: 48 }]),
    );
    expect(nextMeasurements.get(databaseId)).toBe(databaseMeasurement);
    expect(previousMeasurements).toEqual(
      nodeMeasurements(
        [apiId, { width: 204, height: 56 }],
        [databaseId, { width: 176, height: 48 }],
      ),
    );
  });

  it("returns the original measurements for an unknown component", () => {
    const previousMeasurements = nodeMeasurements([
      "api",
      { width: 176, height: 48 },
    ]);

    const nextMeasurements = removeReactFlowNodeMeasurement(
      previousMeasurements,
      componentId("missing"),
    );

    expect(nextMeasurements).toBe(previousMeasurements);
  });

  it("stores measured dimensions without changing previous renderer state", () => {
    const previousMeasurements = nodeMeasurements([
      "database",
      { width: 176, height: 48 },
    ]);
    const measuredDimensions = { width: 204, height: 56 };

    const nextMeasurements = applyReactFlowNodeMeasurementChanges(
      previousMeasurements,
      [
        {
          id: "api",
          type: "dimensions",
          dimensions: measuredDimensions,
        },
      ],
    );
    measuredDimensions.width = 999;

    expect(nextMeasurements).not.toBe(previousMeasurements);
    expect(nextMeasurements).toEqual(
      nodeMeasurements(
        ["database", { width: 176, height: 48 }],
        ["api", { width: 204, height: 56 }],
      ),
    );
    expect(previousMeasurements).toEqual(
      nodeMeasurements(["database", { width: 176, height: 48 }]),
    );
  });

  it("ignores changes outside renderer measurement ownership", () => {
    const previousMeasurements = nodeMeasurements([
      "api",
      { width: 176, height: 48 },
    ]);
    const ignoredChanges: NodeChange[] = [
      { id: "api", type: "dimensions", resizing: true },
      {
        id: "api",
        type: "position",
        position: { x: 120, y: 80 },
        dragging: true,
      },
      { id: "api", type: "select", selected: true },
      { id: "api", type: "remove" },
      {
        type: "add",
        item: { id: "added", position: { x: 0, y: 0 }, data: {} },
      },
      {
        id: "api",
        type: "replace",
        item: { id: "api", position: { x: 0, y: 0 }, data: {} },
      },
    ];

    expect(
      applyReactFlowNodeMeasurementChanges(
        previousMeasurements,
        ignoredChanges,
      ),
    ).toBe(previousMeasurements);
  });

  it("adds measurements to matching derived nodes only", () => {
    const nodes: Node[] = [
      { id: "api", position: { x: 10, y: 20 }, data: { label: "API" } },
      {
        id: "database",
        position: { x: 250, y: 20 },
        data: { label: "Database" },
      },
    ];

    expect(
      withReactFlowNodeMeasurements(
        nodes,
        nodeMeasurements(
          ["api", { width: 176, height: 48 }],
          ["missing", { width: 100, height: 40 }],
        ),
      ),
    ).toEqual([
      {
        id: "api",
        position: { x: 10, y: 20 },
        data: { label: "API" },
        measured: { width: 176, height: 48 },
      },
      {
        id: "database",
        position: { x: 250, y: 20 },
        data: { label: "Database" },
      },
    ]);
  });

  it("preserves measurements when canonical positions change", () => {
    const api = component("api", "API");
    const graph = addComponent(ArchitectureGraph.empty(), api);
    const measurements = applyReactFlowNodeMeasurementChanges(new Map(), [
      {
        id: api.id,
        type: "dimensions",
        dimensions: { width: 176, height: 48 },
      },
    ]);
    const positions = applyReactFlowNodePositionChanges(
      nodePositions([api.id, { x: 0, y: 0 }]),
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: true,
        },
      ],
    );
    const { nodes } = toReactFlowDiagram(graph, positions);

    expect(withReactFlowNodeMeasurements(nodes, measurements)).toEqual([
      {
        id: api.id,
        position: { x: 120, y: 80 },
        data: { label: "API" },
        measured: { width: 176, height: 48 },
      },
    ]);
  });
});
