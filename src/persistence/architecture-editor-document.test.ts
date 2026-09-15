import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  type ArchitectureComponent,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  renameComponentInEditorState,
  type ArchitectureEditorState,
} from "../diagram/architecture-editor-state";
import {
  restoreArchitectureEditorState,
  toPersistedArchitectureEditorDocument,
  type PersistedArchitectureEditorDocumentV1,
  type PersistedArchitectureEditorDocumentV2,
  type RestoreArchitectureEditorStateError,
} from "./architecture-editor-document";

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
  return { id: componentId(id), name, kind };
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
  graph = addComponent(
    graph,
    component("database", "Database", "database"),
  );
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

function renamedEditorStateForSerialization(): ArchitectureEditorState {
  const result = renameComponentInEditorState(
    editorStateForSerialization(),
    componentId("api"),
    "Public API",
  );

  if (!result.ok) {
    throw new Error("Expected component rename to succeed.");
  }

  return result.state;
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

function validV2Document(): PersistedArchitectureEditorDocumentV2 {
  return {
    schemaVersion: 2,
    graph: {
      components: [
        { id: "api", name: "API", kind: "service" },
        { id: "database", name: "Database", kind: "database" },
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
    expect.arrayContaining([...expectedComponents]),
  );
  expect(graph.getConnections()).toHaveLength(expectedConnections.length);
  expect(graph.getConnections()).toEqual(
    expect.arrayContaining([...expectedConnections]),
  );
}

describe("toPersistedArchitectureEditorDocument", () => {
  it("serializes graph structure, kinds, and positions as a plain V2 document", () => {
    const document = toPersistedArchitectureEditorDocument(
      editorStateForSerialization(),
    );

    expect(document).toEqual(validV2Document());
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
    expect(document.graph.components).toEqual([
      { id: "api", name: "API", kind: "service" },
      { id: "database", name: "Database", kind: "database" },
    ]);
    expect(Object.keys(document)).toEqual([
      "schemaVersion",
      "graph",
      "nodePositions",
    ]);
  });

  it("serializes a renamed component with its kind in V2", () => {
    const renamedState = renamedEditorStateForSerialization();
    const document = toPersistedArchitectureEditorDocument(renamedState);

    expect(document.schemaVersion).toBe(2);
    expect(document.graph.components).toContainEqual({
      id: "api",
      name: "Public API",
      kind: "service",
    });
    expect(document.graph.connections).toEqual([
      {
        id: "api-database",
        sourceComponentId: "api",
        targetComponentId: "database",
      },
    ]);
    expect(document.nodePositions).toEqual([
      { componentId: "api", x: 40, y: 80 },
      { componentId: "database", x: 340, y: 160 },
    ]);
    expect(JSON.stringify(document)).not.toContain("nodeMeasurements");
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
  it("restores V1 components with the generic compatibility kind", () => {
    const state = restoreSuccessfully(validDocument());

    expectGraphMembers(
      state.graph,
      [
        component("api", "API", "generic"),
        component("database", "Database", "generic"),
      ],
      [connection("api-database", "api", "database")],
    );
    expect(state.nodePositions).toEqual(
      new Map([
        [componentId("api"), { x: 40, y: 80 }],
        [componentId("database"), { x: 340, y: 160 }],
      ]),
    );
  });

  it("preserves V1 IDs and names exactly without inferring kinds", () => {
    const document = validDocument();
    const state = restoreSuccessfully({
      ...document,
      graph: {
        ...document.graph,
        components: [
          { id: "api", name: " API " },
          { id: "database", name: "Redis Primary" },
        ],
      },
    });

    expect(state.graph.getComponents()).toEqual([
      component("api", " API ", "generic"),
      component("database", "Redis Primary", "generic"),
    ]);
    expect(state.graph.getConnections()).toEqual([
      connection("api-database", "api", "database"),
    ]);
    expect(state.nodePositions).toEqual(
      new Map([
        [componentId("api"), { x: 40, y: 80 }],
        [componentId("database"), { x: 340, y: 160 }],
      ]),
    );
    expect(state.nodeMeasurements).toEqual(new Map());
  });

  it("restores a valid V2 document with required component kinds", () => {
    const state = restoreSuccessfully(validV2Document());

    expectGraphMembers(
      state.graph,
      [
        component("api", "API", "service"),
        component("database", "Database", "database"),
      ],
      [connection("api-database", "api", "database")],
    );
    expect(state.nodePositions).toEqual(
      new Map([
        [componentId("api"), { x: 40, y: 80 }],
        [componentId("database"), { x: 340, y: 160 }],
      ]),
    );
    expect(state.nodeMeasurements).toEqual(new Map());
  });

  it("round trips every supported component kind through V2", () => {
    let graph = ArchitectureGraph.empty();
    const nodePositions = new Map<
      ComponentId,
      Readonly<{ x: number; y: number }>
    >();
    const expectedComponents: ArchitectureComponent[] = [];

    ARCHITECTURE_COMPONENT_KINDS.forEach((kind, index) => {
      const architectureComponent = component(kind, kind, kind);
      graph = addComponent(graph, architectureComponent);
      nodePositions.set(architectureComponent.id, {
        x: index * 100,
        y: index * 50,
      });
      expectedComponents.push(architectureComponent);
    });

    const document = toPersistedArchitectureEditorDocument({
      graph,
      nodePositions,
    });
    const restoredState = restoreSuccessfully(
      JSON.parse(JSON.stringify(document)),
    );

    expect(document.schemaVersion).toBe(2);
    expect(restoredState.graph.getComponents()).toEqual(expectedComponents);
    expect(restoredState.nodePositions).toEqual(nodePositions);
    expect(restoredState.nodeMeasurements).toEqual(new Map());
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

  it("round trips a renamed workspace while keeping renderer measurements transient", () => {
    const renamedState = renamedEditorStateForSerialization();
    const document = toPersistedArchitectureEditorDocument(renamedState);
    const restoredState = restoreSuccessfully(JSON.parse(JSON.stringify(document)));

    expect(restoredState.graph.getComponents()).toContainEqual(
      component("api", "Public API", "service"),
    );
    expect(restoredState.graph.getConnections()).toEqual([
      connection("api-database", "api", "database"),
    ]);
    expect(restoredState.nodePositions).toEqual(renamedState.nodePositions);
    expect(restoredState.nodeMeasurements).toEqual(new Map());
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

  it("rejects a V2 component with a missing kind", () => {
    const document = validV2Document();
    const componentWithoutKind = { id: "api", name: "API" };

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          components: [
            componentWithoutKind,
            document.graph.components[1],
          ],
        },
      }),
    ).toEqual({ type: "invalid-document" });
  });

  it.each(["redis", "", 123, null])(
    "rejects the invalid V2 component kind %j",
    (kind) => {
      const document = validV2Document();

      expect(
        restoreFailure({
          ...document,
          graph: {
            ...document.graph,
            components: [
              { ...document.graph.components[0], kind },
              document.graph.components[1],
            ],
          },
        }),
      ).toEqual({ type: "invalid-document" });
    },
  );

  it("rejects malformed V2 component fields", () => {
    const document = validV2Document();

    expect(
      restoreFailure({
        ...document,
        graph: {
          ...document.graph,
          components: [{ id: 7, name: "API", kind: "service" }],
          connections: [],
        },
        nodePositions: [],
      }),
    ).toEqual({ type: "invalid-document" });
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
      restoreFailure({ ...validDocument(), schemaVersion: 3 }),
    ).toEqual({
      type: "unsupported-schema-version",
      schemaVersion: 3,
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
      [
        component("api", "API", "generic"),
        component("database", "Database", "generic"),
      ],
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
      component("api", "API", "generic"),
    );
    expect(state.nodePositions.get(componentId("api"))).toEqual({
      x: 40,
      y: 80,
    });
  });
});
