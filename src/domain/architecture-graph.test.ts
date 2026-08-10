import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "./architecture-component";
import type { ArchitectureConnection } from "./architecture-connection";
import { ArchitectureGraph } from "./architecture-graph";
import type { ComponentId, ConnectionId } from "./identifiers";

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

  it("allows the reverse direction as a separate connection", () => {
    const graph = graphWithComponents(api, database);

    const graphWithForwardConnection = expectSuccess(
      graph.addConnection(
        connection(
          "api-to-database",
          api.id,
          database.id,
        ),
      ),
    );

    const result = graphWithForwardConnection.addConnection(
      connection(
        "database-to-api",
        database.id,
        api.id,
      ),
    );

    expect(result.ok).toBe(true);
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
        ),
      ),
    );

    const graphWithoutApi = expectSuccess(
      graph.removeComponent(api.id),
    );

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