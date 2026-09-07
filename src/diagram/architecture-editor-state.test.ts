import type { Connection, NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  type ArchitectureEditorState,
  applyReactFlowNodeChangesToEditorState,
  createArchitectureEditorState,
  removeComponentFromEditorState,
} from "./architecture-editor-state";
import {
  createInitialDiagramNodePositions,
  moveDiagramNode,
} from "./diagram-layout";
import {
  toArchitectureConnection,
  toReactFlowDiagram,
} from "./react-flow-adapter";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function component(id: string, name: string): ArchitectureComponent {
  return {
    id: componentId(id),
    name,
  };
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

type GraphResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: unknown };

function expectGraphSuccess(result: GraphResult): ArchitectureGraph {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected graph operation to succeed.");
  }

  return result.graph;
}

function graphWithComponents(
  ...components: ArchitectureComponent[]
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();

  for (const architectureComponent of components) {
    graph = expectGraphSuccess(
      graph.addComponent(architectureComponent),
    );
  }

  return graph;
}

function graphWithConnections(
  graph: ArchitectureGraph,
  ...connections: ArchitectureConnection[]
): ArchitectureGraph {
  let connectedGraph = graph;

  for (const architectureConnection of connections) {
    connectedGraph = expectGraphSuccess(
      connectedGraph.addConnection(architectureConnection),
    );
  }

  return connectedGraph;
}

type EditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: unknown };

function expectEditorStateSuccess(
  result: EditorStateResult,
): ArchitectureEditorState {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected editor-state operation to succeed.");
  }

  return result.state;
}

describe("createArchitectureEditorState", () => {
  it("delegates deterministic position initialization for every component", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const graph = graphWithComponents(api, database);
    const expectedPositions = createInitialDiagramNodePositions(graph);

    const state = createArchitectureEditorState(graph);

    expect(state.graph).toBe(graph);
    expect(state.nodePositions).toEqual(expectedPositions);
    expect(state.nodePositions.size).toBe(graph.getComponents().length);

    for (const architectureComponent of graph.getComponents()) {
      expect(state.nodePositions.get(architectureComponent.id)).toEqual(
        expectedPositions.get(architectureComponent.id),
      );
    }

    expect(state.nodeMeasurements).toEqual(new Map());
  });
});

describe("addComponentToEditorState", () => {
  it("adds a component and position atomically", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const initialState = createArchitectureEditorState(
      graphWithComponents(api),
    );
    const draggedPositions = moveDiagramNode(
      initialState.nodePositions,
      api.id,
      { x: 135, y: 90 },
    );
    const previousState: ArchitectureEditorState = {
      ...initialState,
      nodePositions: draggedPositions,
    };

    const result = addComponentToEditorState(previousState, database);
    const nextState = expectEditorStateSuccess(result);

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph.getComponents()).toEqual([api, database]);
    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 135, y: 90 }],
        [database.id, { x: 375, y: 0 }],
      ]),
    );
    expect(nextState.nodePositions.get(api.id)).toBe(
      previousState.nodePositions.get(api.id),
    );
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(previousState.graph.getComponents()).toEqual([api]);
    expect(previousState.nodePositions.has(database.id)).toBe(false);
  });

  it("propagates duplicate-ID rejection without changing state", () => {
    const api = component("api", "API");
    const state = createArchitectureEditorState(
      graphWithComponents(api),
    );

    const result = addComponentToEditorState(
      state,
      component("api", "Duplicate"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: api.id,
      },
    });
    expect(state.graph.getComponents()).toEqual([api]);
    expect(state.nodePositions).toEqual(
      new Map([[api.id, { x: 0, y: 0 }]]),
    );
    expect(state.nodeMeasurements).toEqual(new Map());
  });

  it("propagates empty-name rejection without changing state", () => {
    const state = createArchitectureEditorState(
      ArchitectureGraph.empty(),
    );
    const unnamedComponent = component("unnamed", " ");

    const result = addComponentToEditorState(
      state,
      unnamedComponent,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-name-empty",
        componentId: unnamedComponent.id,
      },
    });
    expect(state.graph.getComponents()).toEqual([]);
    expect(state.nodePositions).toEqual(new Map());
    expect(state.nodeMeasurements).toEqual(new Map());
  });
});

describe("removeComponentFromEditorState", () => {
  it("removes the component, incident connections, and metadata atomically", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const cache = component("cache", "Cache");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const databaseToCache = connection(
      "database-to-cache",
      database.id,
      cache.id,
    );
    const apiToCache = connection(
      "api-to-cache",
      api.id,
      cache.id,
    );
    const graph = graphWithConnections(
      graphWithComponents(api, database, cache),
      apiToDatabase,
      databaseToCache,
      apiToCache,
    );
    const initializedState = createArchitectureEditorState(graph);
    const apiMeasurement = { width: 176, height: 48 };
    const cacheMeasurement = { width: 190, height: 48 };
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: new Map([
        [api.id, apiMeasurement],
        [database.id, { width: 204, height: 56 }],
        [cache.id, cacheMeasurement],
      ]),
    };

    const result = removeComponentFromEditorState(
      previousState,
      database.id,
    );
    const nextState = expectEditorStateSuccess(result);

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph.getComponents()).toEqual([api, cache]);
    expect(nextState.graph.getConnections()).toEqual([apiToCache]);
    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 0, y: 0 }],
        [cache.id, { x: 480, y: 0 }],
      ]),
    );
    expect(nextState.nodePositions.get(api.id)).toBe(
      previousState.nodePositions.get(api.id),
    );
    expect(nextState.nodeMeasurements).toEqual(
      new Map([
        [api.id, { width: 176, height: 48 }],
        [cache.id, { width: 190, height: 48 }],
      ]),
    );
    expect(nextState.nodeMeasurements.get(api.id)).toBe(apiMeasurement);
    expect(nextState.nodeMeasurements.get(cache.id)).toBe(
      cacheMeasurement,
    );
    expect(previousState.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToCache,
      apiToCache,
    ]);
    expect(previousState.nodePositions.has(database.id)).toBe(true);
    expect(previousState.nodeMeasurements.has(database.id)).toBe(true);
  });

  it("propagates unknown-ID rejection without changing state", () => {
    const api = component("api", "API");
    const state = createArchitectureEditorState(
      graphWithComponents(api),
    );
    const missingId = componentId("missing");
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = removeComponentFromEditorState(state, missingId);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: missingId,
      },
    });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurementsReference);
  });
});

describe("addConnectionToEditorState", () => {
  const api = component("api", "API");
  const database = component("database", "Database");

  it("adds a connection while preserving layout and renderer metadata", () => {
    const initialState = createArchitectureEditorState(
      graphWithComponents(api, database),
    );
    const measurement = { width: 176, height: 48 };
    const previousState: ArchitectureEditorState = {
      ...initialState,
      nodeMeasurements: new Map([[api.id, measurement]]),
    };
    const architectureConnection = connection(
      "api-to-database",
      api.id,
      database.id,
    );

    const result = addConnectionToEditorState(
      previousState,
      architectureConnection,
    );
    const nextState = expectEditorStateSuccess(result);

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).not.toBe(previousState.graph);
    expect(nextState.graph.getConnections()).toEqual([
      architectureConnection,
    ]);
    expect(nextState.nodePositions).toBe(previousState.nodePositions);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.nodeMeasurements.get(api.id)).toBe(measurement);
    expect(previousState.graph.getConnections()).toEqual([]);
  });

  it("allows the reverse ordered direction", () => {
    const forwardConnection = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const graph = graphWithConnections(
      graphWithComponents(api, database),
      forwardConnection,
    );
    const previousState = createArchitectureEditorState(graph);
    const reverseConnection = connection(
      "database-to-api",
      database.id,
      api.id,
    );

    const nextState = expectEditorStateSuccess(
      addConnectionToEditorState(previousState, reverseConnection),
    );

    expect(nextState.graph.getConnections()).toEqual([
      forwardConnection,
      reverseConnection,
    ]);
  });

  it.each([
    {
      name: "a duplicate connection ID",
      proposedConnection: connection(
        "existing",
        database.id,
        api.id,
      ),
      expectedError: {
        type: "connection-id-already-exists" as const,
        connectionId: connectionId("existing"),
      },
    },
    {
      name: "a missing source",
      proposedConnection: connection(
        "missing-source",
        componentId("missing"),
        database.id,
      ),
      expectedError: {
        type: "source-component-id-does-not-exist" as const,
        sourceComponentId: componentId("missing"),
      },
    },
    {
      name: "a missing target",
      proposedConnection: connection(
        "missing-target",
        api.id,
        componentId("missing"),
      ),
      expectedError: {
        type: "target-component-id-does-not-exist" as const,
        targetComponentId: componentId("missing"),
      },
    },
    {
      name: "a self-connection",
      proposedConnection: connection(
        "self-connection",
        api.id,
        api.id,
      ),
      expectedError: {
        type: "source-and-target-component-ids-are-the-same" as const,
        componentId: api.id,
      },
    },
    {
      name: "a duplicate ordered endpoint pair",
      proposedConnection: connection(
        "duplicate-pair",
        api.id,
        database.id,
      ),
      expectedError: {
        type: "connection-already-exists" as const,
        sourceComponentId: api.id,
        targetComponentId: database.id,
      },
    },
  ])("propagates rejection for $name without changing state", ({
    proposedConnection,
    expectedError,
  }) => {
    const existingConnection = connection(
      "existing",
      api.id,
      database.id,
    );
    const graph = graphWithConnections(
      graphWithComponents(api, database),
      existingConnection,
    );
    const state = createArchitectureEditorState(graph);
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = addConnectionToEditorState(
      state,
      proposedConnection,
    );

    expect(result).toEqual({ ok: false, error: expectedError });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurementsReference);
    expect(state.graph.getConnections()).toEqual([existingConnection]);
  });

  it("translates a React Flow connection into a derived canonical edge", () => {
    const previousState = createArchitectureEditorState(
      graphWithComponents(api, database),
    );
    const rendererConnection: Connection = {
      source: api.id,
      target: database.id,
      sourceHandle: null,
      targetHandle: null,
    };
    const architectureConnection = toArchitectureConnection(
      rendererConnection,
      connectionId("created-from-renderer"),
    );

    const nextState = expectEditorStateSuccess(
      addConnectionToEditorState(previousState, architectureConnection),
    );
    const diagram = toReactFlowDiagram(
      nextState.graph,
      nextState.nodePositions,
    );

    expect(diagram.edges).toEqual([
      {
        id: "created-from-renderer",
        source: api.id,
        target: database.id,
        markerEnd: { type: "arrowclosed" },
      },
    ]);
    expect(previousState.graph.getConnections()).toEqual([]);
  });

  it("does not derive an edge from a rejected renderer connection", () => {
    const state = createArchitectureEditorState(
      graphWithComponents(api, database),
    );
    const selfConnection = toArchitectureConnection(
      {
        source: api.id,
        target: api.id,
        sourceHandle: null,
        targetHandle: null,
      },
      connectionId("rejected-self-connection"),
    );

    const result = addConnectionToEditorState(state, selfConnection);

    expect(result.ok).toBe(false);
    expect(
      toReactFlowDiagram(state.graph, state.nodePositions).edges,
    ).toEqual([]);
  });
});

describe("applyReactFlowNodeChangesToEditorState", () => {
  const api = component("api", "API");

  function initialState(): ArchitectureEditorState {
    return createArchitectureEditorState(graphWithComponents(api));
  }

  it("updates positions while preserving graph and measurements", () => {
    const previousState = initialState();

    const nextState = applyReactFlowNodeChangesToEditorState(
      previousState,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: true,
        },
      ],
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).toBe(previousState.graph);
    expect(nextState.nodePositions).not.toBe(
      previousState.nodePositions,
    );
    expect(nextState.nodePositions.get(api.id)).toEqual({
      x: 120,
      y: 80,
    });
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(previousState.nodePositions.get(api.id)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("updates measurements while preserving graph and positions", () => {
    const previousState = initialState();

    const nextState = applyReactFlowNodeChangesToEditorState(
      previousState,
      [
        {
          id: api.id,
          type: "dimensions",
          dimensions: { width: 204, height: 56 },
        },
      ],
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).toBe(previousState.graph);
    expect(nextState.nodePositions).toBe(
      previousState.nodePositions,
    );
    expect(nextState.nodeMeasurements).not.toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.nodeMeasurements.get(api.id)).toEqual({
      width: 204,
      height: 56,
    });
  });

  it("applies position and dimension changes in one state transition", () => {
    const previousState = initialState();

    const nextState = applyReactFlowNodeChangesToEditorState(
      previousState,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: true,
        },
        {
          id: api.id,
          type: "dimensions",
          dimensions: { width: 204, height: 56 },
        },
      ],
    );

    expect(nextState.nodePositions.get(api.id)).toEqual({
      x: 120,
      y: 80,
    });
    expect(nextState.nodeMeasurements.get(api.id)).toEqual({
      width: 204,
      height: 56,
    });
  });

  it("ignores React Flow add and remove changes", () => {
    const previousState = initialState();
    const changes: NodeChange[] = [
      { id: api.id, type: "remove" },
      {
        type: "add",
        item: {
          id: "renderer-only",
          position: { x: 240, y: 0 },
          data: {},
        },
      },
    ];

    const nextState = applyReactFlowNodeChangesToEditorState(
      previousState,
      changes,
    );

    expect(nextState).toBe(previousState);
    expect(nextState.graph.getComponents()).toEqual([api]);
    expect(nextState.nodePositions.has(api.id)).toBe(true);
  });

  it("returns the original state for an empty change batch", () => {
    const previousState = initialState();

    const nextState = applyReactFlowNodeChangesToEditorState(
      previousState,
      [],
    );

    expect(nextState).toBe(previousState);
  });
});

