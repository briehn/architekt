"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Connection, NodeChange } from "@xyflow/react";

import {
  type AddComponentRejection,
  type AddConnectionRejection,
  ArchitectureGraph,
} from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  loadLocalArchitectureEditorState,
  saveLocalArchitectureEditorState,
  type SaveLocalArchitectureEditorStateResult,
  type StorageLike,
} from "../persistence/local-architecture-editor-storage";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  applyReactFlowNodeChangesToEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
} from "./architecture-editor-state";
import {
  toArchitectureConnection,
  toReactFlowDiagram,
  withReactFlowNodeMeasurements,
} from "./react-flow-adapter";
import { StaticDiagram } from "./static-diagram";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function createComponentId(): ComponentId {
  return crypto.randomUUID() as ComponentId;
}

function createConnectionId(): ConnectionId {
  return crypto.randomUUID() as ConnectionId;
}

function getAddComponentErrorMessage(error: AddComponentRejection): string {
  switch (error.type) {
    case "component-name-empty":
      return "Enter a component name.";
    case "component-id-already-exists":
      return "A component with this ID already exists.";
  }
}

function getAddConnectionErrorMessage(
  error: AddConnectionRejection,
): string {
  switch (error.type) {
    case "source-and-target-component-ids-are-the-same":
      return "A component cannot connect to itself.";
    case "connection-already-exists":
      return "That connection already exists.";
    case "source-component-id-does-not-exist":
    case "target-component-id-does-not-exist":
      return "A connected component no longer exists.";
    case "connection-id-already-exists":
      return "That connection could not be created. Try again.";
  }
}

function createExampleArchitectureGraph(): ArchitectureGraph {
  const graph = ArchitectureGraph.empty();
  const api = { id: componentId("api"), name: "API" };
  const database = { id: componentId("database"), name: "Database" };
  const apiToDatabase = {
    id: connectionId("api-to-database"),
    sourceComponentId: api.id,
    targetComponentId: database.id,
  };

  const apiResult = graph.addComponent(api);
  if (!apiResult.ok) return graph;

  const databaseResult = apiResult.graph.addComponent(database);
  if (!databaseResult.ok) return graph;

  const connectionResult = databaseResult.graph.addConnection(apiToDatabase);
  return connectionResult.ok ? connectionResult.graph : graph;
}

// This module-level value remains stable when position state causes a re-render.
const exampleArchitectureGraph = createExampleArchitectureGraph();

function createExampleArchitectureEditorState(): ArchitectureEditorState {
  return createArchitectureEditorState(exampleArchitectureGraph);
}

type EditableArchitectureEditorViewState = {
  readonly editorState: ArchitectureEditorState;
  readonly connectionRejection: AddConnectionRejection | null;
};

type ArchitectureEditorSaveFailure = Extract<
  SaveLocalArchitectureEditorStateResult,
  { readonly ok: false }
>["error"];

type ArchitectureEditorViewState =
  | { readonly status: "loading" }
  | (EditableArchitectureEditorViewState & {
      readonly status: "ready";
      readonly saveFailure: ArchitectureEditorSaveFailure | null;
    })
  | (EditableArchitectureEditorViewState & {
      readonly status: "recovery-required";
      readonly reason:
        | "saved-state-invalid"
        | "unsupported-schema-version";
    })
  | (EditableArchitectureEditorViewState & {
      readonly status: "memory-only";
    });

type PersistedEditorStateBaseline = Pick<
  ArchitectureEditorState,
  "graph" | "nodePositions"
>;

const AUTOSAVE_DELAY_MILLISECONDS = 300;

function persistedEditorStateBaseline(
  editorState: ArchitectureEditorState,
): PersistedEditorStateBaseline {
  return {
    graph: editorState.graph,
    nodePositions: editorState.nodePositions,
  };
}

export function ArchitectureEditor() {
  const [viewState, setViewState] = useState<ArchitectureEditorViewState>({
    status: "loading",
  });
  const [componentName, setComponentName] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const storageRef = useRef<StorageLike | null>(null);
  const autosaveBaselineRef = useRef<PersistedEditorStateBaseline | null>(null);
  const latestEditorStateRef = useRef<ArchitectureEditorState | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      let storage: Storage;

      try {
        storage = window.localStorage;
      } catch {
        storageRef.current = null;
        autosaveBaselineRef.current = null;
        setViewState({
          status: "memory-only",
          editorState: createExampleArchitectureEditorState(),
          connectionRejection: null,
        });
        return;
      }

      storageRef.current = storage;
      const loadResult = loadLocalArchitectureEditorState(storage);

      if (loadResult.status === "loaded") {
        autosaveBaselineRef.current = persistedEditorStateBaseline(
          loadResult.state,
        );
        setViewState({
          status: "ready",
          editorState: loadResult.state,
          connectionRejection: null,
          saveFailure: null,
        });
        return;
      }

      const editorState = createExampleArchitectureEditorState();

      if (loadResult.status === "missing") {
        autosaveBaselineRef.current = persistedEditorStateBaseline(editorState);
        setViewState({
          status: "ready",
          editorState,
          connectionRejection: null,
          saveFailure: null,
        });
        return;
      }

      if (loadResult.error.type === "storage-unavailable") {
        storageRef.current = null;
        autosaveBaselineRef.current = null;
        setViewState({
          status: "memory-only",
          editorState,
          connectionRejection: null,
        });
        return;
      }

      autosaveBaselineRef.current = null;
      setViewState({
        status: "recovery-required",
        reason: loadResult.error.type,
        editorState,
        connectionRejection: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (viewState.status !== "loading") {
      latestEditorStateRef.current = viewState.editorState;
    }
  }, [viewState]);

  const persistEditorState = useCallback(
    (editorStateToSave: ArchitectureEditorState) => {
      const storage = storageRef.current;
      const saveResult: SaveLocalArchitectureEditorStateResult = storage
        ? saveLocalArchitectureEditorState(storage, editorStateToSave)
        : {
            ok: false,
            error: { type: "storage-unavailable" },
          };

      if (saveResult.ok) {
        autosaveBaselineRef.current =
          persistedEditorStateBaseline(editorStateToSave);
      }

      setViewState((currentViewState) => {
        if (currentViewState.status !== "ready") {
          return currentViewState;
        }

        if (!saveResult.ok) {
          return {
            ...currentViewState,
            saveFailure: saveResult.error,
          };
        }

        const savedRevisionIsCurrent =
          currentViewState.editorState.graph === editorStateToSave.graph &&
          currentViewState.editorState.nodePositions ===
            editorStateToSave.nodePositions;

        if (!savedRevisionIsCurrent || currentViewState.saveFailure === null) {
          return currentViewState;
        }

        return {
          ...currentViewState,
          saveFailure: null,
        };
      });
    },
    [],
  );

  const autosaveGraph =
    viewState.status === "ready" ? viewState.editorState.graph : null;
  const autosaveNodePositions =
    viewState.status === "ready" ? viewState.editorState.nodePositions : null;

  useEffect(() => {
    if (autosaveGraph === null || autosaveNodePositions === null) {
      return;
    }

    const baseline = autosaveBaselineRef.current;
    if (
      baseline?.graph === autosaveGraph &&
      baseline.nodePositions === autosaveNodePositions
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const latestEditorState = latestEditorStateRef.current;
      const latestBaseline = autosaveBaselineRef.current;
      if (
        latestEditorState === null ||
        latestEditorState.graph !== autosaveGraph ||
        latestEditorState.nodePositions !== autosaveNodePositions ||
        (latestBaseline?.graph === autosaveGraph &&
          latestBaseline.nodePositions === autosaveNodePositions)
      ) {
        return;
      }

      persistEditorState(latestEditorState);
    }, AUTOSAVE_DELAY_MILLISECONDS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autosaveGraph, autosaveNodePositions, persistEditorState]);

  if (viewState.status === "loading") {
    return (
      <div
        className="flex h-full min-h-0 w-full items-center justify-center bg-surface px-4"
        role="status"
      >
        <p className="text-sm text-text-muted">
          Loading saved workspace…
        </p>
      </div>
    );
  }

  const { editorState, connectionRejection } = viewState;
  const { nodes: diagramNodes, edges } = toReactFlowDiagram(
    editorState.graph,
    editorState.nodePositions,
  );
  const nodes = withReactFlowNodeMeasurements(
    diagramNodes,
    editorState.nodeMeasurements,
  );

  function handleNodesChange(changes: NodeChange[]) {
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const nextEditorState = applyReactFlowNodeChangesToEditorState(
        currentViewState.editorState,
        changes,
      );

      return nextEditorState === currentViewState.editorState
        ? currentViewState
        : { ...currentViewState, editorState: nextEditorState };
    });
  }

  function handleAddComponent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = componentName.trim();

    if (!name) {
      setValidationMessage("Enter a component name.");
      return;
    }

    const component = { id: createComponentId(), name };
    const result = addComponentToEditorState(editorState, component);

    if (!result.ok) {
      setValidationMessage(getAddComponentErrorMessage(result.error));
      return;
    }

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const latestResult = addComponentToEditorState(
        currentViewState.editorState,
        component,
      );

      return latestResult.ok
        ? { ...currentViewState, editorState: latestResult.state }
        : currentViewState;
    });
    setComponentName("");
    setValidationMessage(null);
  }

  function handleDeleteComponent(componentId: ComponentId) {
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = removeComponentFromEditorState(
        currentViewState.editorState,
        componentId,
      );

      return result.ok
        ? { ...currentViewState, editorState: result.state }
        : currentViewState;
    });
  }

  function handleDeleteConnection(connectionId: ConnectionId) {
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = removeConnectionFromEditorState(
        currentViewState.editorState,
        connectionId,
      );

      return result.ok
        ? {
            ...currentViewState,
            editorState: result.state,
            connectionRejection: null,
          }
        : currentViewState;
    });
  }

  function handleConnect(connection: Connection) {
    const architectureConnection = toArchitectureConnection(
      connection,
      createConnectionId(),
    );

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = addConnectionToEditorState(
        currentViewState.editorState,
        architectureConnection,
      );

      return result.ok
        ? {
            ...currentViewState,
            editorState: result.state,
            connectionRejection: null,
          }
        : {
            ...currentViewState,
            connectionRejection: result.error,
          };
    });
  }

  function handleRetrySave() {
    if (viewState.status !== "ready") {
      return;
    }

    persistEditorState(viewState.editorState);
  }

  const components = editorState.graph.getComponents();
  const connections = editorState.graph.getConnections();
  const componentNamesById = new Map(
    components.map((component) => [component.id, component.name]),
  );
  const connectionRows = connections.map((connection) => ({
    connection,
    sourceName: componentNamesById.get(connection.sourceComponentId)!,
    targetName: componentNamesById.get(connection.targetComponentId)!,
  }));
  const connectionRowsWithAmbiguity = connectionRows.map((row) => ({
    ...row,
    isAmbiguous: connectionRows.some(
      (otherRow) =>
        otherRow.connection.id !== row.connection.id &&
        otherRow.sourceName === row.sourceName &&
        otherRow.targetName === row.targetName,
    ),
  }));
  const persistenceNotice =
    viewState.status === "recovery-required"
      ? viewState.reason === "unsupported-schema-version"
        ? "Saved workspace uses an unsupported format. The example workspace is open, but changes are not saved."
        : "Saved workspace couldn’t be read. The example workspace is open, but changes are not saved."
      : viewState.status === "memory-only"
        ? "Storage is unavailable. The example workspace is open, but changes will be lost on refresh."
        : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-4">
        {viewState.status === "ready" && viewState.saveFailure !== null ? (
          <div
            className="mb-3 flex items-center justify-between gap-3"
            role="alert"
          >
            <p className="text-sm text-danger">Changes are not saved.</p>
            <button
              className="h-9 shrink-0 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={handleRetrySave}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : persistenceNotice ? (
          <p
            className={`mb-3 text-sm ${
              viewState.status === "recovery-required"
                ? "text-danger"
                : "text-text-secondary"
            }`}
            role="status"
          >
            {persistenceNotice}
          </p>
        ) : null}

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={handleAddComponent}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label
              className="text-xs font-semibold text-text-secondary"
              htmlFor="component-name"
            >
              Component name
            </label>
            <input
              aria-describedby={
                validationMessage ? "component-name-error" : undefined
              }
              aria-invalid={validationMessage ? true : undefined}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
              id="component-name"
              onChange={(event) => {
                setComponentName(event.target.value);
                setValidationMessage(null);
              }}
              placeholder="e.g. Cache"
              type="text"
              value={componentName}
            />
          </div>
          <button
            className="h-9 rounded-md bg-accent px-3 text-xs font-semibold text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            type="submit"
          >
            Add
          </button>
        </form>

        {validationMessage ? (
          <p
            className="mt-2 text-sm text-danger"
            id="component-name-error"
            role="alert"
          >
            {validationMessage}
          </p>
        ) : null}

        {connectionRejection ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {getAddConnectionErrorMessage(connectionRejection)}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 border-t border-border pt-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-text-secondary">
              Components
            </p>
            {components.length > 0 ? (
              <ul
                aria-label="Components"
                className="mt-2 flex flex-wrap gap-2"
              >
                {components.map((component) => (
                  <li
                    className="flex h-9 items-center overflow-hidden rounded-md border border-border bg-surface-subtle"
                    key={component.id}
                  >
                    <span className="px-3 text-sm text-text-primary">
                      {component.name}
                    </span>
                    <button
                      aria-label={`Delete ${component.name}`}
                      className="h-full border-l border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      onClick={() => handleDeleteComponent(component.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">
                No components yet.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-text-secondary">
              Connections
            </p>
            {connectionRowsWithAmbiguity.length > 0 ? (
              <ul
                aria-label="Connections"
                className="mt-2 flex flex-wrap gap-2"
              >
                {connectionRowsWithAmbiguity.map(
                  ({
                    connection,
                    sourceName,
                    targetName,
                    isAmbiguous,
                  }) => (
                    <li
                      className="flex min-h-9 items-stretch overflow-hidden rounded-md border border-border bg-surface-subtle"
                      key={connection.id}
                    >
                      <span className="flex min-w-0 flex-col justify-center px-3 py-2">
                        <span className="text-sm text-text-primary">
                          {sourceName} <span aria-hidden="true">→</span>
                          <span className="sr-only"> to </span>{" "}
                          {targetName}
                        </span>
                        {isAmbiguous ? (
                          <span className="mt-0.5 break-all font-mono text-xs text-text-muted">
                            {connection.sourceComponentId}{" "}
                            <span aria-hidden="true">→</span>
                            <span className="sr-only"> to </span>{" "}
                            {connection.targetComponentId}
                          </span>
                        ) : null}
                      </span>
                      <button
                        aria-label={
                          isAmbiguous
                            ? `Delete connection from ${sourceName} (${connection.sourceComponentId}) to ${targetName} (${connection.targetComponentId})`
                            : `Delete connection from ${sourceName} to ${targetName}`
                        }
                        className="border-l border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        onClick={() =>
                          handleDeleteConnection(connection.id)
                        }
                        type="button"
                      >
                        Delete
                      </button>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">
                No connections yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <StaticDiagram
          nodes={nodes}
          edges={edges}
          onConnect={handleConnect}
          onNodesChange={handleNodesChange}
        />
      </div>
    </div>
  );
}
