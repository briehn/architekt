"use client";

import { type FormEvent, useState } from "react";
import type { Connection, NodeChange } from "@xyflow/react";

import {
  type AddComponentRejection,
  type AddConnectionRejection,
  ArchitectureGraph,
} from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  applyReactFlowNodeChangesToEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
  removeComponentFromEditorState,
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

type ArchitectureEditorViewState = {
  readonly editorState: ArchitectureEditorState;
  readonly connectionRejection: AddConnectionRejection | null;
};

export function ArchitectureEditor() {
  const [viewState, setViewState] = useState<ArchitectureEditorViewState>(
    () => ({
      editorState: createArchitectureEditorState(
        exampleArchitectureGraph,
      ),
      connectionRejection: null,
    }),
  );
  const [componentName, setComponentName] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
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
      const result = removeComponentFromEditorState(
        currentViewState.editorState,
        componentId,
      );

      return result.ok
        ? { ...currentViewState, editorState: result.state }
        : currentViewState;
    });
  }

  function handleConnect(connection: Connection) {
    const architectureConnection = toArchitectureConnection(
      connection,
      createConnectionId(),
    );

    setViewState((currentViewState) => {
      const result = addConnectionToEditorState(
        currentViewState.editorState,
        architectureConnection,
      );

      return result.ok
        ? {
            editorState: result.state,
            connectionRejection: null,
          }
        : {
            ...currentViewState,
            connectionRejection: result.error,
          };
    });
  }

  const components = editorState.graph.getComponents();

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-4">
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

        <div className="mt-3 border-t border-border pt-3">
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
