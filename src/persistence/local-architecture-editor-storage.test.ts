import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";
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

function editorState(): ArchitectureEditorState {
  let graph = ArchitectureGraph.empty();
  graph = addComponent(graph, component("api", "API"));
  graph = addComponent(graph, component("database", "Database"));
  graph = addConnection(
    graph,
    connection("api-database", "api", "database"),
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
    expect(saveLocalArchitectureEditorState(storage, editorState())).toEqual({
      ok: true,
    });

    const result = loadLocalArchitectureEditorState(storage);

    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.state.graph.getComponents()).toHaveLength(2);
      expect(result.state.graph.getComponents()).toEqual(
        expect.arrayContaining([
          component("api", "API"),
          component("database", "Database"),
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
    }
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

  it("preserves unsupported schema versions as a distinct failure", () => {
    const storage = new MemoryStorage();
    storage.values.set(storageKey, JSON.stringify({ schemaVersion: 2 }));

    expect(loadLocalArchitectureEditorState(storage)).toEqual({
      status: "failed",
      error: {
        type: "unsupported-schema-version",
        schemaVersion: 2,
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
      expect(loadResult.state.graph.getComponents()).toHaveLength(2);
      expect(loadResult.state.graph.getConnections()).toHaveLength(1);
      expect(loadResult.state.nodePositions).toEqual(
        stateWithRendererData.nodePositions,
      );
      expect(loadResult.state.nodeMeasurements).toEqual(new Map());
    }
  });
});
