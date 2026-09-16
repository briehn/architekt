import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  type ArchitectureComponent,
  type ArchitectureComponentKind,
} from "./architecture-component";
import {
  ARCHITECTURE_CONNECTION_KINDS,
  type ArchitectureConnection,
  type ArchitectureConnectionKind,
} from "./architecture-connection";
import { ArchitectureGraph } from "./architecture-graph";
import type { ComponentId, ConnectionId } from "./identifiers";

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

function expectSuccess(result: GraphResult): ArchitectureGraph {
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

  for (const currentComponent of components) {
    graph = expectSuccess(graph.addComponent(currentComponent));
  }

  return graph;
}

describe("ArchitectureGraph.addComponent", () => {
  it("adds a new component to the graph", () => {
    const api = component("api", "API");

    const result = ArchitectureGraph.empty().addComponent(api);

    expect(result.ok).toBe(true);
  });

  it("rejects a duplicate component ID", () => {
    const api = component("api", "API");
    const graph = expectSuccess(
      ArchitectureGraph.empty().addComponent(api),
    );

    const result = graph.addComponent(api);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: api.id,
      },
    });
  });

  it("rejects an empty component name", () => {
    const unnamedComponent = component("unnamed", "");
    const graph = ArchitectureGraph.empty();

    const result = graph.addComponent(unnamedComponent);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-name-empty",
        componentId: unnamedComponent.id,
      },
    });
    expect(graph.getComponents()).toEqual([]);
  });

  it("rejects a whitespace-only component name", () => {
    const unnamedComponent = component("unnamed", " \t\n ");

    const result = ArchitectureGraph.empty().addComponent(
      unnamedComponent,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-name-empty",
        componentId: unnamedComponent.id,
      },
    });
  });

  it("preserves the supplied value of a valid component name", () => {
    const api = component("api", "  Public API  ");

    const graph = expectSuccess(
      ArchitectureGraph.empty().addComponent(api),
    );

    expect(graph.getComponents()).toEqual([api]);
  });

  it("reports a duplicate ID before validating the component name", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);

    const result = graph.addComponent(component("api", ""));

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: api.id,
      },
    });
    expect(graph.getComponents()).toEqual([api]);
  });

  it("does not mutate the original graph", () => {
    const api = component("api", "API");
    const originalGraph = ArchitectureGraph.empty();

    const updatedGraph = expectSuccess(
      originalGraph.addComponent(api),
    );

    expect(updatedGraph.addComponent(api)).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: api.id,
      },
    });

    expect(originalGraph.addComponent(api).ok).toBe(true);
  });
});

describe("ArchitectureGraph.removeComponent", () => {
  it("rejects an unknown component ID", () => {
    const missingId = componentId("missing");

    const result =
      ArchitectureGraph.empty().removeComponent(missingId);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: missingId,
      },
    });
  });

  it("removes an existing component", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);

    const removedGraph = expectSuccess(
      graph.removeComponent(api.id),
    );

    expect(removedGraph.addComponent(api).ok).toBe(true);
  });

  it("does not mutate the original graph", () => {
    const api = component("api", "API");
    const originalGraph = graphWithComponents(api);

    const removedGraph = expectSuccess(
      originalGraph.removeComponent(api.id),
    );

    expect(originalGraph.addComponent(api)).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: api.id,
      },
    });

    expect(removedGraph.addComponent(api).ok).toBe(true);
  });
});

describe("ArchitectureGraph.renameComponent", () => {
  it("renames a component while preserving its ID and kind", () => {
    const api = component("api", "API", "gateway");
    const graph = graphWithComponents(api);

    const renamedGraph = expectSuccess(
      graph.renameComponent(api.id, "Public API"),
    );

    expect(renamedGraph).not.toBe(graph);
    expect(renamedGraph.getComponents()).toEqual([
      { id: api.id, name: "Public API", kind: api.kind },
    ]);
  });

  it("does not mutate the original graph", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const graph = graphWithComponents(api, database);

    const renamedGraph = expectSuccess(
      graph.renameComponent(api.id, "Public API"),
    );

    expect(graph.getComponents()).toEqual([api, database]);
    expect(renamedGraph.getComponents()).toEqual([
      { id: api.id, name: "Public API", kind: api.kind },
      database,
    ]);
  });

  it("rejects an unknown component ID", () => {
    const missingId = componentId("missing");

    expect(
      ArchitectureGraph.empty().renameComponent(missingId, "Missing"),
    ).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: missingId,
      },
    });
  });

  it("rejects an empty name", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);

    expect(graph.renameComponent(api.id, "")).toEqual({
      ok: false,
      error: { type: "component-name-empty", componentId: api.id },
    });
  });

  it("rejects a whitespace-only name", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);

    expect(graph.renameComponent(api.id, " \t\n ")).toEqual({
      ok: false,
      error: { type: "component-name-empty", componentId: api.id },
    });
  });

  it("reports an unknown ID before validating the name", () => {
    const missingId = componentId("missing");

    expect(
      ArchitectureGraph.empty().renameComponent(missingId, " "),
    ).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: missingId,
      },
    });
  });

  it("returns the original graph for an exact name match", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);
    const result = graph.renameComponent(api.id, api.name);

    expect(result).toEqual({ ok: true, graph });
    expect(expectSuccess(result)).toBe(graph);
  });

  it("preserves a valid name exactly", () => {
    const api = component("api", "API");
    const graph = graphWithComponents(api);

    const renamedGraph = expectSuccess(
      graph.renameComponent(api.id, "  Public API  "),
    );

    expect(renamedGraph.getComponents()).toEqual([
      { id: api.id, name: "  Public API  ", kind: api.kind },
    ]);
  });

  it("allows duplicate component names", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const graph = graphWithComponents(api, database);

    const renamedGraph = expectSuccess(
      graph.renameComponent(database.id, api.name),
    );

    expect(renamedGraph.getComponents()).toEqual([
      api,
      { id: database.id, name: api.name, kind: database.kind },
    ]);
  });

  it("preserves connection kinds after renaming", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "request-response",
    );
    const graph = expectSuccess(
      graphWithComponents(api, database).addConnection(apiToDatabase),
    );

    const renamedGraph = expectSuccess(
      graph.renameComponent(api.id, "Public API"),
    );

    expect(renamedGraph.getConnections()).toEqual([apiToDatabase]);
    expect(graph.getConnections()).toEqual([apiToDatabase]);
  });
});

describe("ArchitectureGraph.changeComponentKind", () => {
  it("changes only the target component kind and preserves connections", () => {
    const api = component("api", " API ", "service");
    const database = component("database", "Database", "database");
    const cache = component("cache", "Cache", "cache");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "data-access",
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
      "async-messaging",
    );
    let graph = graphWithComponents(api, database, cache);

    graph = expectSuccess(graph.addConnection(apiToDatabase));
    graph = expectSuccess(graph.addConnection(databaseToApi));
    graph = expectSuccess(graph.addConnection(databaseToCache));

    const changedGraph = expectSuccess(
      graph.changeComponentKind(api.id, "database"),
    );

    expect(changedGraph).not.toBe(graph);
    expect(graph.getComponents()).toEqual([api, database, cache]);
    expect(changedGraph.getComponents()).toEqual([
      { id: api.id, name: " API ", kind: "database" },
      database,
      cache,
    ]);
    expect(graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
      databaseToCache,
    ]);
    expect(changedGraph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
      databaseToCache,
    ]);
  });

  it("rejects an unknown component ID", () => {
    const missingId = componentId("missing");

    expect(
      ArchitectureGraph.empty().changeComponentKind(missingId, "service"),
    ).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: missingId,
      },
    });
  });

  it("returns the original graph for an exact kind match", () => {
    const api = component("api", "API", "gateway");
    const graph = graphWithComponents(api);
    const result = graph.changeComponentKind(api.id, api.kind);

    expect(result).toEqual({ ok: true, graph });
    expect(expectSuccess(result)).toBe(graph);
  });

  it.each(ARCHITECTURE_COMPONENT_KINDS)(
    "accepts the supported %s kind through the typed API",
    (kind) => {
      const api = component("api", "API", "generic");
      const graph = graphWithComponents(api);
      const changedGraph = expectSuccess(
        graph.changeComponentKind(api.id, kind),
      );

      expect(changedGraph.getComponents()).toEqual([
        { id: api.id, name: api.name, kind },
      ]);
    },
  );
});

describe("ArchitectureGraph component kind preservation", () => {
  it("keeps component kinds through connection edits and deletion of another component", () => {
    const api = component("api", "API", "gateway");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const graph = graphWithComponents(api, database);

    const connectedGraph = expectSuccess(
      graph.addConnection(apiToDatabase),
    );
    const disconnectedGraph = expectSuccess(
      connectedGraph.removeConnection(apiToDatabase.id),
    );
    const graphWithoutApi = expectSuccess(
      connectedGraph.removeComponent(api.id),
    );

    expect(connectedGraph.getComponents()).toEqual([api, database]);
    expect(disconnectedGraph.getComponents()).toEqual([api, database]);
    expect(graphWithoutApi.getComponents()).toEqual([database]);
  });
});

describe("ArchitectureGraph.changeConnectionKind", () => {
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

  function graphWithConnections(): ArchitectureGraph {
    let graph = graphWithComponents(api, database, cache);
    graph = expectSuccess(graph.addConnection(apiToDatabase));
    graph = expectSuccess(graph.addConnection(databaseToApi));
    return expectSuccess(graph.addConnection(databaseToCache));
  }

  it("replaces only the targeted connection kind while preserving graph structure", () => {
    const graph = graphWithConnections();

    const result = graph.changeConnectionKind(
      apiToDatabase.id,
      "request-response",
    );

    expect(result.ok).toBe(true);
    const changedGraph = expectSuccess(result);

    expect(changedGraph).not.toBe(graph);
    expect(graph.getComponents()).toEqual([api, database, cache]);
    expect(changedGraph.getComponents()).toEqual([api, database, cache]);
    expect(graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
      databaseToCache,
    ]);
    expect(changedGraph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "request-response" },
      databaseToApi,
      databaseToCache,
    ]);
  });

  it("rejects an unknown connection ID without changing the graph", () => {
    const graph = graphWithConnections();
    const missingConnectionId = connectionId("missing");

    expect(
      graph.changeConnectionKind(missingConnectionId, "async-messaging"),
    ).toEqual({
      ok: false,
      error: {
        type: "connection-id-does-not-exist",
        connectionId: missingConnectionId,
      },
    });
    expect(graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
      databaseToCache,
    ]);
  });

  it("returns the original graph for an exact connection kind match", () => {
    const graph = graphWithConnections();
    const result = graph.changeConnectionKind(
      databaseToApi.id,
      databaseToApi.kind,
    );

    expect(result).toEqual({ ok: true, graph });
    expect(expectSuccess(result)).toBe(graph);
  });

  it.each(ARCHITECTURE_CONNECTION_KINDS)(
    "accepts the supported %s kind through the typed API",
    (kind) => {
      const graph = graphWithComponents(api, database);
      const genericConnection = connection(
        "api-to-database",
        api.id,
        database.id,
        "generic",
      );
      const connectedGraph = expectSuccess(
        graph.addConnection(genericConnection),
      );
      const changedGraph = expectSuccess(
        connectedGraph.changeConnectionKind(genericConnection.id, kind),
      );

      expect(changedGraph.getConnections()).toEqual([
        { ...genericConnection, kind },
      ]);
    },
  );
});

describe("ArchitectureGraph.addConnection", () => {
  const api = component("api", "API");
  const database = component("database", "Database");

  it("adds a connection when both endpoints exist", () => {
    const graph = graphWithComponents(api, database);
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );

    const result = graph.addConnection(apiToDatabase);

    expect(result.ok).toBe(true);
  });

  it("rejects a duplicate connection ID", () => {
    const graph = graphWithComponents(api, database);
    const apiToDatabase = connection(
      "connection",
      api.id,
      database.id,
    );

    const connectedGraph = expectSuccess(
      graph.addConnection(apiToDatabase),
    );

    const reverseWithSameId = connection(
      "connection",
      database.id,
      api.id,
    );

    expect(
      connectedGraph.addConnection(reverseWithSameId),
    ).toEqual({
      ok: false,
      error: {
        type: "connection-id-already-exists",
        connectionId: reverseWithSameId.id,
      },
    });
  });

  it("rejects a missing source component", () => {
    const graph = graphWithComponents(database);
    const missingSourceId = componentId("missing-source");

    const result = graph.addConnection(
      connection(
        "missing-source-to-database",
        missingSourceId,
        database.id,
      ),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "source-component-id-does-not-exist",
        sourceComponentId: missingSourceId,
      },
    });
  });

  it("rejects a missing target component", () => {
    const graph = graphWithComponents(api);
    const missingTargetId = componentId("missing-target");

    const result = graph.addConnection(
      connection(
        "api-to-missing-target",
        api.id,
        missingTargetId,
      ),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "target-component-id-does-not-exist",
        targetComponentId: missingTargetId,
      },
    });
  });

  it("rejects a self-connection", () => {
    const graph = graphWithComponents(api);
    const selfConnection = connection(
      "api-to-api",
      api.id,
      api.id,
    );

    const result = graph.addConnection(selfConnection);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "source-and-target-component-ids-are-the-same",
        componentId: api.id,
      },
    });
  });

  it("rejects a duplicate ordered source and target pair", () => {
    const graph = graphWithComponents(api, database);

    const firstConnection = connection(
      "first-api-to-database",
      api.id,
      database.id,
    );

    const connectedGraph = expectSuccess(
      graph.addConnection(firstConnection),
    );

    const duplicatePair = connection(
      "second-api-to-database",
      api.id,
      database.id,
    );

    expect(connectedGraph.addConnection(duplicatePair)).toEqual({
      ok: false,
      error: {
        type: "connection-already-exists",
        sourceComponentId: api.id,
        targetComponentId: database.id,
      },
    });
  });

  it("allows reverse-direction connections to have independent kinds", () => {
    const graph = graphWithComponents(api, database);
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "request-response",
    );
    const databaseToApi = connection(
      "database-to-api",
      database.id,
      api.id,
      "streaming",
    );

    const graphWithForwardConnection = expectSuccess(
      graph.addConnection(apiToDatabase),
    );

    const result = graphWithForwardConnection.addConnection(
      databaseToApi,
    );

    expect(result.ok).toBe(true);
    expect(expectSuccess(result).getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
  });

  it("does not mutate the original graph", () => {
    const originalGraph = graphWithComponents(api, database);

    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );

    const updatedGraph = expectSuccess(
      originalGraph.addConnection(apiToDatabase),
    );

    expect(updatedGraph.addConnection(apiToDatabase)).toEqual({
      ok: false,
      error: {
        type: "connection-id-already-exists",
        connectionId: apiToDatabase.id,
      },
    });

    expect(
      originalGraph.addConnection(apiToDatabase).ok,
    ).toBe(true);
  });
});

describe("ArchitectureGraph.removeConnection", () => {
  const api = component("api", "API");
  const database = component("database", "Database");
  const cache = component("cache", "Cache");

  it("rejects an unknown connection ID", () => {
    const missingId = connectionId("missing");

    const result =
      ArchitectureGraph.empty().removeConnection(missingId);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "connection-id-does-not-exist",
        connectionId: missingId,
      },
    });
  });

  it("removes an existing connection", () => {
    const baseGraph = graphWithComponents(api, database, cache);

    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "data-access",
    );
    const databaseToCache = connection(
      "database-to-cache",
      database.id,
      cache.id,
      "streaming",
    );

    const connectedGraph = expectSuccess(
      expectSuccess(
        baseGraph.addConnection(apiToDatabase),
      ).addConnection(databaseToCache),
    );

    const removedGraph = expectSuccess(
      connectedGraph.removeConnection(apiToDatabase.id),
    );

    expect(removedGraph.getComponents()).toEqual([
      api,
      database,
      cache,
    ]);
    expect(removedGraph.getConnections()).toEqual([databaseToCache]);
    expect(connectedGraph.getConnections()).toEqual([
      apiToDatabase,
      databaseToCache,
    ]);

    const replacementConnection = connection(
      "replacement-api-to-database",
      api.id,
      database.id,
    );

    expect(
      removedGraph.addConnection(replacementConnection).ok,
    ).toBe(true);
  });

  it("does not mutate the original graph", () => {
    const baseGraph = graphWithComponents(api, database);

    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );

    const connectedGraph = expectSuccess(
      baseGraph.addConnection(apiToDatabase),
    );

    const removedGraph = expectSuccess(
      connectedGraph.removeConnection(apiToDatabase.id),
    );

    const replacementConnection = connection(
      "replacement-api-to-database",
      api.id,
      database.id,
    );

    expect(
      connectedGraph.addConnection(replacementConnection),
    ).toEqual({
      ok: false,
      error: {
        type: "connection-already-exists",
        sourceComponentId: api.id,
        targetComponentId: database.id,
      },
    });

    expect(
      removedGraph.addConnection(replacementConnection).ok,
    ).toBe(true);
  });
});

describe("ArchitectureGraph component cascade removal", () => {
  it("removes all incident connections while preserving unrelated connections", () => {
    const api = component("api", "API");
    const database = component("database", "Database");
    const cache = component("cache", "Cache");

    let graph = graphWithComponents(api, database, cache);

    graph = expectSuccess(
      graph.addConnection(
        connection(
          "api-to-database",
          api.id,
          database.id,
        ),
      ),
    );

    graph = expectSuccess(
      graph.addConnection(
        connection(
          "cache-to-api",
          cache.id,
          api.id,
        ),
      ),
    );

    graph = expectSuccess(
      graph.addConnection(
        connection(
          "database-to-cache",
          database.id,
          cache.id,
          "async-messaging",
        ),
      ),
    );

    const graphWithoutApi = expectSuccess(
      graph.removeComponent(api.id),
    );

    expect(graphWithoutApi.getConnections()).toEqual([
      connection(
        "database-to-cache",
        database.id,
        cache.id,
        "async-messaging",
      ),
    ]);

    expect(
      graphWithoutApi.addConnection(
        connection(
          "new-api-to-database",
          api.id,
          database.id,
        ),
      ),
    ).toEqual({
      ok: false,
      error: {
        type: "source-component-id-does-not-exist",
        sourceComponentId: api.id,
      },
    });

    const graphWithApiRestored = expectSuccess(
      graphWithoutApi.addComponent(api),
    );

    expect(
      graphWithApiRestored.addConnection(
        connection(
          "replacement-api-to-database",
          api.id,
          database.id,
        ),
      ).ok,
    ).toBe(true);

    expect(
      graphWithApiRestored.addConnection(
        connection(
          "replacement-cache-to-api",
          cache.id,
          api.id,
        ),
      ).ok,
    ).toBe(true);

    expect(
      graphWithApiRestored.addConnection(
        connection(
          "duplicate-database-to-cache",
          database.id,
          cache.id,
        ),
      ),
    ).toEqual({
      ok: false,
      error: {
        type: "connection-already-exists",
        sourceComponentId: database.id,
        targetComponentId: cache.id,
      },
    });
  });
});

describe("ArchitectureGraph read boundary", () => {
  const api = component("api", "API");
  const database = component("database", "Database");
  const cache = component("cache", "Cache");

  it("returns empty component and connection collections for an empty graph", () => {
    const graph = ArchitectureGraph.empty();
    const firstComponentRead = graph.getComponents();
    const firstConnectionRead = graph.getConnections();

    expect(firstComponentRead).toEqual([]);
    expect(firstConnectionRead).toEqual([]);
    expect(firstComponentRead).not.toBe(graph.getComponents());
    expect(firstConnectionRead).not.toBe(graph.getConnections());
  });

  it("retains connection kinds through the read boundary", () => {
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "data-access",
    );
    const graph = expectSuccess(
      graphWithComponents(api, database).addConnection(apiToDatabase),
    );

    expect(graph.getComponents()).toHaveLength(2);
    expect(graph.getComponents()).toEqual(
      expect.arrayContaining([api, database]),
    );
    expect(graph.getConnections()).toEqual([apiToDatabase]);
  });

  it("excludes explicitly removed components and connections", () => {
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "async-messaging",
    );
    let graph = expectSuccess(
      graphWithComponents(api, database, cache).addConnection(
        apiToDatabase,
      ),
    );

    graph = expectSuccess(graph.removeConnection(apiToDatabase.id));
    graph = expectSuccess(graph.removeComponent(cache.id));

    expect(graph.getComponents()).toHaveLength(2);
    expect(graph.getComponents()).toEqual(
      expect.arrayContaining([api, database]),
    );
    expect(graph.getConnections()).toEqual([]);
  });

  it("excludes connections cascade-removed with a component", () => {
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const cacheToApi = connection(
      "cache-to-api",
      cache.id,
      api.id,
    );
    const databaseToCache = connection(
      "database-to-cache",
      database.id,
      cache.id,
    );
    let graph = graphWithComponents(api, database, cache);

    graph = expectSuccess(graph.addConnection(apiToDatabase));
    graph = expectSuccess(graph.addConnection(cacheToApi));
    graph = expectSuccess(graph.addConnection(databaseToCache));
    graph = expectSuccess(graph.removeComponent(api.id));

    expect(graph.getComponents()).toHaveLength(2);
    expect(graph.getComponents()).toEqual(
      expect.arrayContaining([database, cache]),
    );
    expect(graph.getConnections()).toEqual([databaseToCache]);
  });

  it("protects graph state from mutation of a returned component array", () => {
    const graph = graphWithComponents(api, database);
    const firstRead = graph.getComponents();
    const mutableComponents = firstRead as ArchitectureComponent[];

    expect(firstRead).not.toBe(graph.getComponents());

    mutableComponents.splice(0, mutableComponents.length);

    expect(graph.getComponents()).toHaveLength(2);
    expect(graph.getComponents()).toEqual(
      expect.arrayContaining([api, database]),
    );
  });

  it("protects graph state from mutation of a returned connection array", () => {
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const graph = expectSuccess(
      graphWithComponents(api, database).addConnection(apiToDatabase),
    );
    const firstRead = graph.getConnections();
    const mutableConnections = firstRead as ArchitectureConnection[];

    expect(firstRead).not.toBe(graph.getConnections());

    mutableConnections.splice(0, mutableConnections.length);

    expect(graph.getConnections()).toEqual([apiToDatabase]);
  });

  it("protects graph state from mutation of a returned component object", () => {
    const graph = graphWithComponents(api);
    const firstRead = graph.getComponents();
    const mutableComponent = firstRead[0] as ArchitectureComponent;
    const secondRead = graph.getComponents();

    expect(mutableComponent).not.toBe(secondRead[0]);

    mutableComponent.name = "Changed outside the graph";

    expect(graph.getComponents()).toEqual([api]);
  });

  it("protects graph state from mutation of a returned connection object", () => {
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const graph = expectSuccess(
      graphWithComponents(api, database).addConnection(apiToDatabase),
    );
    const firstRead = graph.getConnections();
    const mutableConnection = firstRead[0] as ArchitectureConnection;
    const secondRead = graph.getConnections();

    expect(mutableConnection).not.toBe(secondRead[0]);

    mutableConnection.targetComponentId = api.id;
    mutableConnection.kind = "streaming";

    expect(graph.getConnections()).toEqual([apiToDatabase]);
  });

  it("keeps original graph reads unchanged when an operation creates an updated graph", () => {
    const originalGraph = graphWithComponents(api, database);
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );

    const updatedGraph = expectSuccess(
      originalGraph.addConnection(apiToDatabase),
    );

    expect(originalGraph.getComponents()).toHaveLength(2);
    expect(originalGraph.getComponents()).toEqual(
      expect.arrayContaining([api, database]),
    );
    expect(originalGraph.getConnections()).toEqual([]);
    expect(updatedGraph.getConnections()).toEqual([apiToDatabase]);
  });
});
