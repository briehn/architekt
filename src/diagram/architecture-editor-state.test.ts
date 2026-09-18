import type { Connection, NodeChange } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  autoLayoutArchitectureEditorState,
  type ArchitectureEditorState,
  applyReactFlowNodeChangesToEditorState,
  changeComponentKindInEditorState,
  changeConnectionKindInEditorState,
  createArchitectureEditorState,
  createFreshArchitectureEditorState,
  renameComponentInEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
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

function component(
  id: string,
  name: string,
  kind: ArchitectureComponentKind = "service",
): ArchitectureComponent {
  return {
    id: componentId(id),
    name,
    kind,
  };
}

function connection(
  id: string,
  sourceComponentId: ComponentId,
  targetComponentId: ComponentId,
  kind: ArchitectureConnectionKind = "generic",
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId,
    targetComponentId,
    kind,
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

describe("createFreshArchitectureEditorState", () => {
  it("uses deterministic fallback-size layout without changing graph content or measurements", () => {
    const api = component("api", "API", "service");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "data-access",
    );
    const graph = graphWithConnections(
      graphWithComponents(api, database),
      apiToDatabase,
    );

    const state = createFreshArchitectureEditorState(graph);

    expect(state.graph).toBe(graph);
    expect(state.graph.getComponents()).toEqual([api, database]);
    expect(state.graph.getConnections()).toEqual([apiToDatabase]);
    expect(state.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 368, y: 32 }],
      ]),
    );
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

describe("renameComponentInEditorState", () => {
  it("renames a component while preserving layout, measurements, and connections", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const initializedState = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        apiToDatabase,
      ),
    );
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: new Map([[api.id, { width: 176, height: 48 }]]),
    };

    const nextState = expectEditorStateSuccess(
      renameComponentInEditorState(previousState, api.id, "Public API"),
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).not.toBe(previousState.graph);
    expect(nextState.nodePositions).toBe(previousState.nodePositions);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.graph.getComponents()).toEqual([
      { id: api.id, name: "Public API", kind: api.kind },
      database,
    ]);
    expect(nextState.graph.getConnections()).toEqual([apiToDatabase]);
    expect(previousState.graph.getComponents()).toEqual([api, database]);
    expect(previousState.graph.getConnections()).toEqual([apiToDatabase]);
  });

  it("returns the original state for an exact name match", () => {
    const api = component("api", "API");
    const state = createArchitectureEditorState(graphWithComponents(api));
    const result = renameComponentInEditorState(state, api.id, api.name);

    expect(result).toEqual({ ok: true, state });
    expect(expectEditorStateSuccess(result)).toBe(state);
  });

  it("propagates blank-name rejection without changing state", () => {
    const api = component("api", "API");
    const state = createArchitectureEditorState(graphWithComponents(api));
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = renameComponentInEditorState(state, api.id, " \t ");

    expect(result).toEqual({
      ok: false,
      error: { type: "component-name-empty", componentId: api.id },
    });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurementsReference);
    expect(state.graph.getComponents()).toEqual([api]);
  });

  it("propagates unknown-ID rejection without changing state", () => {
    const api = component("api", "API");
    const state = createArchitectureEditorState(graphWithComponents(api));
    const missingId = componentId("missing");
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = renameComponentInEditorState(
      state,
      missingId,
      "Missing",
    );

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
    expect(state.graph.getComponents()).toEqual([api]);
  });
});

describe("changeComponentKindInEditorState", () => {
  it("changes only the target kind while preserving editor metadata and connections", () => {
    const api = component("api", " API ", "service");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const databaseToApi = connection(
      "database-to-api",
      database.id,
      api.id,
    );
    const initializedState = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        apiToDatabase,
        databaseToApi,
      ),
    );
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: new Map([[api.id, { width: 176, height: 48 }]]),
    };

    const nextState = expectEditorStateSuccess(
      changeComponentKindInEditorState(
        previousState,
        api.id,
        "gateway",
      ),
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).not.toBe(previousState.graph);
    expect(nextState.nodePositions).toBe(previousState.nodePositions);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.graph.getComponents()).toEqual([
      { id: api.id, name: " API ", kind: "gateway" },
      database,
    ]);
    expect(nextState.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
    expect(previousState.graph.getComponents()).toEqual([api, database]);
    expect(previousState.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
  });

  it("returns the original state for an exact kind match", () => {
    const api = component("api", "API", "gateway");
    const state = createArchitectureEditorState(graphWithComponents(api));
    const result = changeComponentKindInEditorState(
      state,
      api.id,
      api.kind,
    );

    expect(result).toEqual({ ok: true, state });
    expect(expectEditorStateSuccess(result)).toBe(state);
  });

  it("propagates unknown-ID rejection without changing state", () => {
    const api = component("api", "API", "service");
    const state = createArchitectureEditorState(graphWithComponents(api));
    const missingId = componentId("missing");
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = changeComponentKindInEditorState(
      state,
      missingId,
      "database",
    );

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
    expect(state.graph.getComponents()).toEqual([api]);
  });
});

describe("changeConnectionKindInEditorState", () => {
  it("changes only the target connection kind while preserving editor metadata and components", () => {
    const api = component("api", "API", "service");
    const database = component("database", "Database", "database");
    const cache = component("cache", "Cache", "cache");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "generic",
    );
    const databaseToApi = connection(
      "database-to-api",
      database.id,
      api.id,
      "streaming",
    );
    const databaseToCache = connection(
      "database-to-cache",
      database.id,
      cache.id,
      "data-access",
    );
    const initializedState = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database, cache),
        apiToDatabase,
        databaseToApi,
        databaseToCache,
      ),
    );
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: new Map([[api.id, { width: 176, height: 48 }]]),
    };

    const nextState = expectEditorStateSuccess(
      changeConnectionKindInEditorState(
        previousState,
        apiToDatabase.id,
        "request-response",
      ),
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).not.toBe(previousState.graph);
    expect(nextState.nodePositions).toBe(previousState.nodePositions);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.graph.getComponents()).toEqual([api, database, cache]);
    expect(nextState.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "request-response" },
      databaseToApi,
      databaseToCache,
    ]);
    expect(previousState.graph.getComponents()).toEqual([
      api,
      database,
      cache,
    ]);
    expect(previousState.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
      databaseToCache,
    ]);
  });

  it("returns the original state for an exact connection kind match", () => {
    const api = component("api", "API");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "async-messaging",
    );
    const state = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        apiToDatabase,
      ),
    );

    const result = changeConnectionKindInEditorState(
      state,
      apiToDatabase.id,
      apiToDatabase.kind,
    );

    expect(result).toEqual({ ok: true, state });
    expect(expectEditorStateSuccess(result)).toBe(state);
  });

  it("propagates unknown-ID rejection without changing state", () => {
    const api = component("api", "API");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const state = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        apiToDatabase,
      ),
    );
    const missingId = connectionId("missing");
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = changeConnectionKindInEditorState(
      state,
      missingId,
      "data-access",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "connection-id-does-not-exist",
        connectionId: missingId,
      },
    });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurementsReference);
    expect(state.graph.getComponents()).toEqual([api, database]);
    expect(state.graph.getConnections()).toEqual([apiToDatabase]);
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
        data: { kind: "generic" },
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

describe("removeConnectionFromEditorState", () => {
  it("removes one connection while preserving components and editor metadata", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const cache = component("cache", "Cache");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const apiToCache = connection(
      "api-to-cache",
      api.id,
      cache.id,
    );
    const initializedState = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database, cache),
        apiToDatabase,
        apiToCache,
      ),
    );
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
      ]),
    };

    const nextState = expectEditorStateSuccess(
      removeConnectionFromEditorState(
        previousState,
        apiToDatabase.id,
      ),
    );

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).not.toBe(previousState.graph);
    expect(nextState.graph.getComponents()).toEqual([
      api,
      database,
      cache,
    ]);
    expect(nextState.graph.getConnections()).toEqual([apiToCache]);
    expect(nextState.nodePositions).toBe(previousState.nodePositions);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(previousState.graph.getConnections()).toEqual([
      apiToDatabase,
      apiToCache,
    ]);

    expect(
      toReactFlowDiagram(nextState.graph, nextState.nodePositions),
    ).toEqual({
      nodes: [
        {
          id: api.id,
          data: {
            componentId: api.id,
            name: "API",
            kind: api.kind,
          },
          position: { x: 0, y: 0 },
        },
        {
          id: database.id,
          data: {
            componentId: database.id,
            name: "Database",
            kind: database.kind,
          },
          position: { x: 240, y: 0 },
        },
        {
          id: cache.id,
          data: {
            componentId: cache.id,
            name: "Cache",
            kind: cache.kind,
          },
          position: { x: 480, y: 0 },
        },
      ],
      edges: [
        {
          id: apiToCache.id,
          source: api.id,
          target: cache.id,
          markerEnd: { type: "arrowclosed" },
          data: { kind: "generic" },
        },
      ],
    });
  });

  it("propagates unknown-ID rejection without changing state", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const existingConnection = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const state = createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        existingConnection,
      ),
    );
    const missingId = connectionId("missing");
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;
    const measurementsReference = state.nodeMeasurements;

    const result = removeConnectionFromEditorState(state, missingId);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "connection-id-does-not-exist",
        connectionId: missingId,
      },
    });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurementsReference);
    expect(state.graph.getConnections()).toEqual([existingConnection]);
  });
});

describe("autoLayoutArchitectureEditorState", () => {
  const api = component("api", "API", "gateway");
  const database = component("database", "Database", "database");
  const apiToDatabase = connection(
    "api-to-database",
    api.id,
    database.id,
    "data-access",
  );

  function connectedState(): ArchitectureEditorState {
    return createArchitectureEditorState(
      graphWithConnections(
        graphWithComponents(api, database),
        apiToDatabase,
      ),
    );
  }

  it("replaces only positions when layout changes", () => {
    const previousState = connectedState();
    const graphComponentsBeforeLayout = previousState.graph.getComponents();
    const graphConnectionsBeforeLayout = previousState.graph.getConnections();
    const result = autoLayoutArchitectureEditorState(previousState);
    const nextState = expectEditorStateSuccess(result);

    expect(nextState).not.toBe(previousState);
    expect(nextState.graph).toBe(previousState.graph);
    expect(nextState.nodeMeasurements).toBe(
      previousState.nodeMeasurements,
    );
    expect(nextState.nodePositions).not.toBe(previousState.nodePositions);
    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 368, y: 32 }],
      ]),
    );
    expect(nextState.nodePositions.size).toBe(
      previousState.graph.getComponents().length,
    );
    expect(nextState.graph.getComponents()).toEqual(
      graphComponentsBeforeLayout,
    );
    expect(nextState.graph.getConnections()).toEqual(
      graphConnectionsBeforeLayout,
    );
    expect(previousState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 0, y: 0 }],
        [database.id, { x: 240, y: 0 }],
      ]),
    );
  });

  it("uses valid current measurements while preserving their exact reference", () => {
    const initializedState = connectedState();
    const measurements = new Map([
      [api.id, { width: 220, height: 90 }],
      [database.id, { width: 140, height: 60 }],
    ]);
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: measurements,
    };
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(previousState),
    );

    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 412, y: 47 }],
      ]),
    );
    expect(nextState.nodeMeasurements).toBe(measurements);
    expect(nextState.nodeMeasurements.get(api.id)).toBe(
      measurements.get(api.id),
    );
  });

  it("uses the pure-layout fallback when a current measurement is missing", () => {
    const initializedState = connectedState();
    const measurements = new Map([[api.id, { width: 220, height: 90 }]]);
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: measurements,
    };
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(previousState),
    );

    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 412, y: 41 }],
      ]),
    );
    expect(nextState.nodeMeasurements).toBe(measurements);
  });

  it("lets the pure layout module fall back for an invalid current measurement", () => {
    const initializedState = connectedState();
    const measurements = new Map([
      [api.id, { width: Number.NaN, height: 90 }],
    ]);
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: measurements,
    };
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(previousState),
    );

    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 368, y: 32 }],
      ]),
    );
    expect(nextState.nodeMeasurements).toBe(measurements);
  });

  it("ignores stale measurement IDs", () => {
    const initializedState = connectedState();
    const measurements = new Map([
      ["removed-component", { width: 800, height: 400 }],
    ]);
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodeMeasurements: measurements,
    };
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(previousState),
    );

    expect(nextState.nodePositions).toEqual(
      new Map([
        [api.id, { x: 32, y: 32 }],
        [database.id, { x: 368, y: 32 }],
      ]),
    );
    expect(nextState.nodeMeasurements).toBe(measurements);
    expect(nextState.nodeMeasurements.get("removed-component")).toBe(
      measurements.get("removed-component"),
    );
  });

  it("returns the original state when layout coordinates are already equal", () => {
    const initializedState = connectedState();
    const positions = new Map([
      [api.id, { x: 32, y: 32 }],
      [database.id, { x: 368, y: 32 }],
    ]);
    const previousState: ArchitectureEditorState = {
      ...initializedState,
      nodePositions: positions,
    };
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(previousState),
    );

    expect(nextState).toBe(previousState);
    expect(nextState.nodePositions).toBe(positions);
    expect(nextState.graph).toBe(previousState.graph);
    expect(nextState.nodeMeasurements).toBe(previousState.nodeMeasurements);
  });

  it("treats an empty graph as an identity-preserving no-op", () => {
    const state = createArchitectureEditorState(ArchitectureGraph.empty());
    const nextState = expectEditorStateSuccess(
      autoLayoutArchitectureEditorState(state),
    );

    expect(nextState).toBe(state);
    expect(nextState.nodePositions).toBe(state.nodePositions);
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
