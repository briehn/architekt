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
  renameComponentInEditorState,
  type ArchitectureEditorState,
} from "../diagram/architecture-editor-state";
import {
  clearLocalArchitectureEditorState,
  loadLocalArchitectureEditorState,
  saveLocalArchitectureEditorState,
  type StorageLike,
} from "./local-architecture-editor-storage";

const storageKey = "architekt:architecture-editor";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly getItemCalls: string[] = [];
  readonly setItemCalls: Array<Readonly<{ key: string; value: string }>> =
    [];
  readonly removeItemCalls: string[] = [];
  throwOnGet = false;
  throwOnSet = false;
  throwOnRemove = false;

  getItem(key: string): string | null {
    this.getItemCalls.push(key);

    if (this.throwOnGet) {
      throw new Error("Storage read failed.");
    }

    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setItemCalls.push({ key, value });

    if (this.throwOnSet) {
      throw new Error("Storage write failed.");
    }

    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removeItemCalls.push(key);

    if (this.throwOnRemove) {
      throw new Error("Storage removal failed.");
    }

    this.values.delete(key);
  }
}

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
  kind: ArchitectureConnectionKind = "generic",
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId: componentId(sourceComponentId),
    targetComponentId: componentId(targetComponentId),
    kind,
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

function editorState(): ArchitectureEditorState {
  let graph = ArchitectureGraph.empty();
  graph = addComponent(graph, component("api", "API"));
  graph = addComponent(
    graph,
    component("database", "Database", "database"),
  );
  graph = addConnection(
    graph,
    connection(
      "api-database",
      "api",
      "database",
      "request-response",
    ),
  );

  return {
    graph,
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

function renamedEditorState(): ArchitectureEditorState {
  const result = renameComponentInEditorState(
    editorState(),
    componentId("api"),
    "Public API",
  );

  if (!result.ok) {
    throw new Error("Expected component rename to succeed.");
  }

  return result.state;
}

function persistedV1Document(): unknown {
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

function persistedV2Document(): unknown {
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

describe("loadLocalArchitectureEditorState", () => {
  it("returns missing when the storage key does not exist", () => {
    const storage = new MemoryStorage();

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "missing",
    });
    expect(storage.getItemCalls).toEqual([storageKey]);
  });

  it("loads a saved V1 editor document", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, JSON.stringify(persistedV1Document()));

    const result = loadLocalArchitectureEditorState(storage);

    expect(storage.getItemCalls).toEqual([storageKey]);
    expect(storage.setItemCalls).toEqual([]);
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.state.graph.getComponents()).toHaveLength(2);
      expect(result.state.graph.getComponents()).toEqual(
        expect.arrayContaining([
          component("api", "API", "generic"),
          component("database", "Database", "generic"),
        ]),
      );
      expect(result.state.graph.getConnections()).toEqual([
        connection("api-database", "api", "database"),
      ]);
      expect(result.state.nodePositions).toEqual(
        new Map([
          [componentId("api"), { x: 40, y: 80 }],
          [componentId("database"), { x: 340, y: 160 }],
        ]),
      );
      expect(result.state.nodeMeasurements).toEqual(new Map());
    }
  });

  it("upgrades a loaded V1 document only on the next canonical save", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, JSON.stringify(persistedV1Document()));

    const loadResult = loadLocalArchitectureEditorState(storage);

    expect(storage.setItemCalls).toEqual([]);
    if (loadResult.status !== "loaded") {
      throw new Error("Expected V1 document to load.");
    }

    const renameResult = renameComponentInEditorState(
      loadResult.state,
      componentId("api"),
      "Public API",
    );
    if (!renameResult.ok) {
      throw new Error("Expected canonical edit to succeed.");
    }

    expect(
      saveLocalArchitectureEditorState(storage, renameResult.state),
    ).toEqual({ ok: true });
    expect(storage.setItemCalls).toHaveLength(1);
    expect(JSON.parse(storage.setItemCalls[0]?.value ?? "")).toMatchObject({
      schemaVersion: 3,
      graph: {
        components: [
          { id: "api", name: "Public API", kind: "generic" },
          { id: "database", name: "Database", kind: "generic" },
        ],
        connections: [
          {
            id: "api-database",
            sourceComponentId: "api",
            targetComponentId: "database",
            kind: "generic",
          },
        ],
      },
    });
  });

  it("loads V2 without writing and upgrades it only on the next canonical save", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, JSON.stringify(persistedV2Document()));

    const loadResult = loadLocalArchitectureEditorState(storage);

    expect(storage.getItemCalls).toEqual([storageKey]);
    expect(storage.setItemCalls).toEqual([]);
    expect(loadResult.status).toBe("loaded");
    if (loadResult.status !== "loaded") {
      throw new Error("Expected V2 document to load.");
    }

    expect(loadResult.state.graph.getComponents()).toEqual([
      component("api", "API", "service"),
      component("database", "Database", "database"),
    ]);
    expect(loadResult.state.graph.getConnections()).toEqual([
      connection("api-database", "api", "database", "generic"),
    ]);
    expect(loadResult.state.nodePositions).toEqual(
      new Map([
        [componentId("api"), { x: 40, y: 80 }],
        [componentId("database"), { x: 340, y: 160 }],
      ]),
    );
    expect(loadResult.state.nodeMeasurements).toEqual(new Map());

    const renameResult = renameComponentInEditorState(
      loadResult.state,
      componentId("api"),
      "Public API",
    );
    if (!renameResult.ok) {
      throw new Error("Expected canonical edit to succeed.");
    }

    expect(
      saveLocalArchitectureEditorState(storage, renameResult.state),
    ).toEqual({ ok: true });
    expect(storage.setItemCalls).toHaveLength(1);
    expect(JSON.parse(storage.setItemCalls[0]?.value ?? "")).toMatchObject({
      schemaVersion: 3,
      graph: {
        components: [
          { id: "api", name: "Public API", kind: "service" },
          { id: "database", name: "Database", kind: "database" },
        ],
        connections: [
          {
            id: "api-database",
            sourceComponentId: "api",
            targetComponentId: "database",
            kind: "generic",
          },
        ],
      },
    });
  });

  it("maps corrupted JSON to saved-state-invalid", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, "{not-json");

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: { type: "saved-state-invalid" },
    });
  });

  it("maps codec validation failures to saved-state-invalid", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 1,
        graph: { components: [], connections: [] },
        nodePositions: [{ componentId: "orphan", x: 0, y: 0 }],
      }),
    );

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: { type: "saved-state-invalid" },
    });
  });

  it("maps an invalid V2 component kind to saved-state-invalid", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 2,
        graph: {
          components: [{ id: "api", name: "API", kind: "redis" }],
          connections: [],
        },
        nodePositions: [{ componentId: "api", x: 0, y: 0 }],
      }),
    );

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: { type: "saved-state-invalid" },
    });
  });

  it("maps an invalid V3 connection kind to saved-state-invalid", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 3,
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
              kind: "grpc",
            },
          ],
        },
        nodePositions: [
          { componentId: "api", x: 40, y: 80 },
          { componentId: "database", x: 340, y: 160 },
        ],
      }),
    );

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: { type: "saved-state-invalid" },
    });
  });

  it("preserves unsupported schema versions as a distinct failure", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, JSON.stringify({ schemaVersion: 4 }));

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: {
        type: "unsupported-schema-version",
        schemaVersion: 4,
      },
    });
  });

  it("maps getItem exceptions to storage-unavailable", () => {
    const storage = new MemoryStorage();
    storage.throwOnGet = true;

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: { type: "storage-unavailable" },
    });
  });
});

describe("saveLocalArchitectureEditorState", () => {
  it("serializes the complete document before one setItem call", () => {
    const storage = new MemoryStorage();

    expect(saveLocalArchitectureEditorState(storage, editorState())).toEqual({
      ok: true,
    });
    expect(storage.setItemCalls).toHaveLength(1);
    expect(storage.setItemCalls[0]?.key).toBe(storageKey);
    expect(JSON.parse(storage.setItemCalls[0]?.value ?? "")).toEqual({
      schemaVersion: 3,
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
            kind: "request-response",
          },
        ],
      },
      nodePositions: [
        { componentId: "api", x: 40, y: 80 },
        { componentId: "database", x: 340, y: 160 },
      ],
    });
  });

  it("maps invalid editor state to editor-state-invalid without writing", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, "previous-document");
    const invalidState = {
      ...editorState(),
      nodePositions: new Map(),
    };

    expect(
      saveLocalArchitectureEditorState(storage, invalidState),
    ).toEqual({
      ok: false,
      error: { type: "editor-state-invalid" },
    });
    expect(storage.setItemCalls).toEqual([]);
    expect(storage.values.get(storageKey)).toBe("previous-document");
  });

  it("maps setItem exceptions to storage-unavailable", () => {
    const storage = new MemoryStorage();
    storage.throwOnSet = true;

    expect(saveLocalArchitectureEditorState(storage, editorState())).toEqual({
      ok: false,
      error: { type: "storage-unavailable" },
    });
  });

  it("does not replace a previous document when setItem fails", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, "previous-document");
    storage.throwOnSet = true;

    saveLocalArchitectureEditorState(storage, editorState());

    expect(storage.setItemCalls).toHaveLength(1);
    expect(storage.values.get(storageKey)).toBe("previous-document");
  });

  it("does not mutate the supplied editor state", () => {
    const storage = new MemoryStorage();
    const state = editorState();
    const componentsBeforeSave = state.graph.getComponents();
    const connectionsBeforeSave = state.graph.getConnections();
    const positionsBeforeSave = Array.from(state.nodePositions.entries());
    const measurementsBeforeSave = Array.from(
      state.nodeMeasurements.entries(),
    );

    saveLocalArchitectureEditorState(storage, state);

    expect(state.graph.getComponents()).toEqual(componentsBeforeSave);
    expect(state.graph.getConnections()).toEqual(connectionsBeforeSave);
    expect(Array.from(state.nodePositions.entries())).toEqual(
      positionsBeforeSave,
    );
    expect(Array.from(state.nodeMeasurements.entries())).toEqual(
      measurementsBeforeSave,
    );
  });
});

describe("clearLocalArchitectureEditorState", () => {
  it("removes the saved editor document", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, "saved-document");

    expect(clearLocalArchitectureEditorState(storage)).toEqual({ ok: true });
    expect(storage.removeItemCalls).toEqual([storageKey]);
    expect(storage.values.has(storageKey)).toBe(false);
  });

  it("maps removeItem exceptions to storage-unavailable", () => {
    const storage = new MemoryStorage();
    storage.throwOnRemove = true;

    expect(clearLocalArchitectureEditorState(storage)).toEqual({
      ok: false,
      error: { type: "storage-unavailable" },
    });
  });
});

describe("local architecture editor storage round trip", () => {
  it("preserves graph and positions while excluding renderer data", () => {
    const storage = new MemoryStorage();
    const stateWithRendererData = Object.assign(editorState(), {
      nodes: [{ id: "react-flow-node" }],
      edges: [{ id: "react-flow-edge" }],
    });

    expect(
      saveLocalArchitectureEditorState(storage, stateWithRendererData),
    ).toEqual({ ok: true });

    const serializedDocument = storage.values.get(storageKey);
    expect(serializedDocument).toBeDefined();
    expect(serializedDocument).not.toContain("nodeMeasurements");
    expect(serializedDocument).not.toContain("width");
    expect(serializedDocument).not.toContain("height");
    expect(serializedDocument).not.toContain("react-flow-node");
    expect(serializedDocument).not.toContain("react-flow-edge");

    const loadResult = loadLocalArchitectureEditorState(storage);
    expect(loadResult.status).toBe("loaded");
    if (loadResult.status === "loaded") {
      expect(loadResult.state.graph.getComponents()).toEqual(
        stateWithRendererData.graph.getComponents(),
      );
      expect(loadResult.state.graph.getConnections()).toHaveLength(1);
      expect(loadResult.state.graph.getConnections()).toEqual(
        stateWithRendererData.graph.getConnections(),
      );
      expect(loadResult.state.nodePositions).toEqual(
        stateWithRendererData.nodePositions,
      );
      expect(loadResult.state.nodeMeasurements).toEqual(new Map());
    }
  });

  it("stores and restores a renamed component through the existing storage key", () => {
    const storage = new MemoryStorage();
    const state = renamedEditorState();

    expect(saveLocalArchitectureEditorState(storage, state)).toEqual({
      ok: true,
    });
    expect(storage.setItemCalls).toHaveLength(1);
    expect(storage.setItemCalls[0]?.key).toBe(storageKey);
    expect(JSON.parse(storage.setItemCalls[0]?.value ?? "")).toMatchObject({
      schemaVersion: 3,
      graph: {
        components: expect.arrayContaining([
          { id: "api", name: "Public API", kind: "service" },
        ]),
        connections: [
          {
            id: "api-database",
            sourceComponentId: "api",
            targetComponentId: "database",
            kind: "request-response",
          },
        ],
      },
    });

    const loadResult = loadLocalArchitectureEditorState(storage);
    expect(loadResult.status).toBe("loaded");
    if (loadResult.status === "loaded") {
      expect(loadResult.state.graph.getComponents()).toContainEqual(
        component("api", "Public API", "service"),
      );
      expect(loadResult.state.graph.getConnections()).toEqual([
        connection(
          "api-database",
          "api",
          "database",
          "request-response",
        ),
      ]);
      expect(loadResult.state.nodePositions).toEqual(state.nodePositions);
      expect(loadResult.state.nodeMeasurements).toEqual(new Map());
    }
  });
});
