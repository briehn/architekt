import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";
import {
  restoreArchitectureEditorState,
  toPersistedArchitectureEditorDocument,
  type PersistedArchitectureEditorDocumentV1,
  type RestoreArchitectureEditorStateError,
} from "./architecture-editor-document";

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
  sourceComponentId: string,
  targetComponentId: string,
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId: componentId(sourceComponentId),
    targetComponentId: componentId(targetComponentId),
  };
}

function addComponent(
  graph: ArchitectureGraph,
  architectureComponent: ArchitectureComponent,
): ArchitectureGraph {
  const result = graph.addComponent(architectureComponent);

  if (!result.ok) {
    throw new Error("Expected component to be added.");
  }

  return result.graph;
}

function addConnection(
  graph: ArchitectureGraph,
  architectureConnection: ArchitectureConnection,
): ArchitectureGraph {
  const result = graph.addConnection(architectureConnection);

  if (!result.ok) {
    throw new Error("Expected connection to be added.");
  }

  return result.graph;
}

function graphForSerialization(): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();
  graph = addComponent(graph, component("api", "API"));
  graph = addComponent(graph, component("database", "Database"));
  return addConnection(graph, connection("api-database", "api", "database"));
}

function editorStateForSerialization(): ArchitectureEditorState {
  return {
    graph: graphForSerialization(),
    nodePositions: new Map([
      [componentId("api"), { x: 40, y: 80 }],
      [componentId("database"), { x: 340, y: 160 }],
    ]),
    nodeMeasurements: new Map([
      ["api", { width: 180, height: 64 }],
      ["database", { width: 200, height: 72 }],
    ]),
  };
}

function validDocument(): PersistedArchitectureEditorDocumentV1 {
  return {
    schemaVersion: 1,
    graph: {
      components: [
        { id: "api", name: "API" },
        { id: "database", name: "Database" },
      ],
      connections: [
        {
          id: "api-database",
          sourceComponentId: "api",
          targetComponentId: "database",
        },
      ],
    },
    nodePositions: [
      { componentId: "api", x: 40, y: 80 },
      { componentId: "database", x: 340, y: 160 },
    ],
  };
}

function restoreSuccessfully(value: unknown): ArchitectureEditorState {
  const result = restoreArchitectureEditorState(value);

  if (!result.ok) {
    throw new Error(`Expected restoration to succeed: ${result.error.type}`);
  }

  return result.state;
}

function restoreFailure(value: unknown): RestoreArchitectureEditorStateError {
  const result = restoreArchitectureEditorState(value);

  if (result.ok) {
    throw new Error("Expected restoration to fail.");
  }

  return result.error;
}

function expectGraphMembers(
  graph: ArchitectureGraph,
  expectedComponents: readonly ArchitectureComponent[],
  expectedConnections: readonly ArchitectureConnection[],
): void {
  expect(graph.getComponents()).toHaveLength(expectedComponents.length);
  expect(graph.getComponents()).toEqual(
    expect.arrayContaining(expectedComponents),
  );
  expect(graph.getConnections()).toHaveLength(expectedConnections.length);
  expect(graph.getConnections()).toEqual(
    expect.arrayContaining(expectedConnections),
  );
}

describe("toPersistedArchitectureEditorDocument", () => {
  it("serializes graph structure and positions as a plain V1 document", () => {
    const document = toPersistedArchitectureEditorDocument(
      editorStateForSerialization(),
    );

    expect(document).toEqual(validDocument());
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("excludes renderer measurements and other non-persisted state", () => {
    const document = toPersistedArchitectureEditorDocument(
      editorStateForSerialization(),
    );
    const serialized = JSON.stringify(document);

    expect(serialized).not.toContain("nodeMeasurements");
    expect(serialized).not.toContain("width");
    expect(serialized).not.toContain("height");
    expect(Object.keys(document)).toEqual([
      "schemaVersion",
      "graph",
      "nodePositions",
    ]);
  });

  it("does not mutate or retain mutable data from the source state", () => {
    const sourceState = editorStateForSerialization();
    const sourceComponents = sourceState.graph.getComponents();
    const sourceConnections = sourceState.graph.getConnections();
    const sourcePositions = Array.from(sourceState.nodePositions.entries());
    const sourceMeasurements = Array.from(
      sourceState.nodeMeasurements.entries(),
    );

    const document = toPersistedArchitectureEditorDocument(sourceState);

    (document.graph.components[0] as { name: string }).name = "Changed";
    (document.nodePositions[0] as { x: number }).x = 999;

    expect(sourceState.graph.getComponents()).toEqual(sourceComponents);
    expect(sourceState.graph.getConnections()).toEqual(sourceConnections);
    expect(Array.from(sourceState.nodePositions.entries())).toEqual(
      sourcePositions,
    );
    expect(Array.from(sourceState.nodeMeasurements.entries())).toEqual(
      sourceMeasurements,
    );
  });
});

describe("restoreArchitectureEditorState", () => {
  it("restores a valid graph and its node positions", () => {
    const state = restoreSuccessfully(validDocument());

    expectGraphMembers(
      state.graph,
      [component("api", "API"), component("database", "Database")],
      [connection("api-database", "api", "database")],
    );
    expect(state.nodePositions).toEqual(
      new Map([
        [componentId("api"), { x: 40, y: 80 }],
        [componentId("database"), { x: 340, y: 160 }],
      ]),
    );
  });

  it("round trips through JSON deterministically", () => {
    const originalDocument = toPersistedArchitectureEditorDocument(
      editorStateForSerialization(),
    );
    const parsedDocument: unknown = JSON.parse(
      JSON.stringify(originalDocument),
    );
    const restoredState = restoreSuccessfully(parsedDocument);

    expect(
      toPersistedArchitectureEditorDocument(restoredState),
    ).toEqual(originalDocument);
  });

  it("starts restored renderer measurements empty", () => {
    const state = restoreSuccessfully(validDocument());

    expect(state.nodeMeasurements).toEqual(new Map());
  });

  it.each([
    null,
    [],
    {},
    { schemaVersion: 1 },
    { schemaVersion: 1, graph: null, nodePositions: [] },
    {
      schemaVersion: 1,
      graph: { components: {}, connections: [] },
      nodePositions: [],
    },
    {
      schemaVersion: 1,
      graph: { components: [], connections: {} },
      nodePositions: [],
    },
    {
      schemaVersion: 1,
      graph: { components: [{ id: 7, name: "API" }], connections: [] },
      nodePositions: [],
    },
    {
      schemaVersion: 1,
      graph: {
        components: [],
        connections: [
          { id: "connection", sourceComponentId: "api" },
        ],
      },
      nodePositions: [],
    },
    {
      schemaVersion: 1,
      graph: { components: [], connections: [] },
      nodePositions: {},
    },
    {
      schemaVersion: 1,
      graph: { components: [], connections: [] },
      nodePositions: [{ componentId: "api", x: "0", y: 0 }],
    },
  ])("rejects malformed document shape %#", (value) => {
    expect(restoreFailure(value)).toEqual({ type: "invalid-document" });
  });

  it("distinguishes a missing schema version from an unsupported version", () => {
    const document = validDocument();
    const withoutVersion = {
      graph: document.graph,
      nodePositions: document.nodePositions,
    };

    expect(restoreFailure(withoutVersion)).toEqual({
      type: "invalid-document",
    });
    expect(
      restoreFailure({ ...validDocument(), schemaVersion: 2 }),
    ).toEqual({
      type: "unsupported-schema-version",
      schemaVersion: 2,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite coordinates: %s",
    (coordinate) => {
      const document = validDocument();

      expect(
        restoreFailure({
          ...document,
          nodePositions: [
            { componentId: "api", x: coordinate, y: 0 },
            document.nodePositions[1],
          ],
        }),
      ).toEqual({ type: "invalid-node-positions" });
    },
  );

  it("rejects duplicate position records", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        nodePositions: [
          ...document.nodePositions,
          { componentId: "api", x: 500, y: 500 },
        ],
      }),
    ).toEqual({ type: "invalid-node-positions" });
  });

  it("rejects missing component positions", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        nodePositions: [document.nodePositions[0]],
      }),
    ).toEqual({ type: "invalid-node-positions" });
  });

  it("rejects orphan positions", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        nodePositions: [
          ...document.nodePositions,
          { componentId: "cache", x: 640, y: 0 },
        ],
      }),
    ).toEqual({ type: "invalid-node-positions" });
  });

  it("rejects duplicate component IDs through the graph", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          components: [
            ...document.graph.components,
            { id: "api", name: "Duplicate API" },
          ],
        },
      }),
    ).toEqual({
      type: "invalid-graph",
      rejection: {
        type: "component-id-already-exists",
        componentId: "api",
      },
    });
  });

  it("rejects blank component names through the graph", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          components: [{ id: "api", name: "   " }],
          connections: [],
        },
        nodePositions: [{ componentId: "api", x: 0, y: 0 }],
      }),
    ).toEqual({
      type: "invalid-graph",
      rejection: { type: "component-name-empty", componentId: "api" },
    });
  });

  it("rejects duplicate connection IDs through the graph", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        graph: {
          components: [
            ...document.graph.components,
            { id: "cache", name: "Cache" },
          ],
          connections: [
            ...document.graph.connections,
            {
              id: "api-database",
              sourceComponentId: "database",
              targetComponentId: "cache",
            },
          ],
        },
        nodePositions: [
          ...document.nodePositions,
          { componentId: "cache", x: 640, y: 0 },
        ],
      }),
    ).toEqual({
      type: "invalid-graph",
      rejection: {
        type: "connection-id-already-exists",
        connectionId: "api-database",
      },
    });
  });

  it.each([
    ["missing", "database", "source-component-id-does-not-exist"],
    ["api", "missing", "target-component-id-does-not-exist"],
  ] as const)(
    "rejects a connection whose endpoint is missing",
    (sourceComponentId, targetComponentId, rejectionType) => {
      const document = validDocument();

      const error = restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          connections: [
            {
              id: "invalid-connection",
              sourceComponentId,
              targetComponentId,
            },
          ],
        },
      });

      expect(error.type).toBe("invalid-graph");
      if (error.type === "invalid-graph") {
        expect(error.rejection.type).toBe(rejectionType);
      }
    },
  );

  it("rejects self-connections through the graph", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          connections: [
            {
              id: "api-self",
              sourceComponentId: "api",
              targetComponentId: "api",
            },
          ],
        },
      }),
    ).toEqual({
      type: "invalid-graph",
      rejection: {
        type: "source-and-target-component-ids-are-the-same",
        componentId: "api",
      },
    });
  });

  it("rejects duplicate ordered endpoint pairs through the graph", () => {
    const document = validDocument();

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          connections: [
            ...document.graph.connections,
            {
              id: "second-api-database",
              sourceComponentId: "api",
              targetComponentId: "database",
            },
          ],
        },
      }),
    ).toEqual({
      type: "invalid-graph",
      rejection: {
        type: "connection-already-exists",
        sourceComponentId: "api",
        targetComponentId: "database",
      },
    });
  });

  it("accepts connections in both directions", () => {
    const document = validDocument();
    const state = restoreSuccessfully({
      ...document,
      graph: {
        ...document.graph,
        connections: [
          ...document.graph.connections,
          {
            id: "database-api",
            sourceComponentId: "database",
            targetComponentId: "api",
          },
        ],
      },
    });

    expectGraphMembers(
      state.graph,
      [component("api", "API"), component("database", "Database")],
      [
        connection("api-database", "api", "database"),
        connection("database-api", "database", "api"),
      ],
    );
  });

  it("does not mutate or retain mutable data from the persisted input", () => {
    const document = validDocument() as {
      schemaVersion: 1;
      graph: {
        components: Array<{ id: string; name: string }>;
        connections: Array<{
          id: string;
          sourceComponentId: string;
          targetComponentId: string;
        }>;
      };
      nodePositions: Array<{
        componentId: string;
        x: number;
        y: number;
      }>;
    };
    const beforeRestore = JSON.stringify(document);

    const state = restoreSuccessfully(document);

    expect(JSON.stringify(document)).toBe(beforeRestore);

    document.graph.components[0].name = "Changed";
    document.nodePositions[0].x = 999;

    expect(state.graph.getComponents()).toContainEqual(
      component("api", "API"),
    );
    expect(state.nodePositions.get(componentId("api"))).toEqual({
      x: 40,
      y: 80,
    });
  });
});
