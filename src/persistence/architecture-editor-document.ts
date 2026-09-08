import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import {
  type AddComponentRejection,
  type AddConnectionRejection,
  ArchitectureGraph,
} from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";

export const ARCHITECTURE_EDITOR_DOCUMENT_SCHEMA_VERSION = 1;

export type PersistedArchitectureEditorDocumentV1 = Readonly<{
  schemaVersion: 1;
  graph: Readonly<{
    components: ReadonlyArray<
      Readonly<{
        id: string;
        name: string;
      }>
    >;
    connections: ReadonlyArray<
      Readonly<{
        id: string;
        sourceComponentId: string;
        targetComponentId: string;
      }>
    >;
  }>;
  nodePositions: ReadonlyArray<
    Readonly<{
      componentId: string;
      x: number;
      y: number;
    }>
  >;
}>;

export type RestoreArchitectureEditorStateError =
  | {
      type: "unsupported-schema-version";
      schemaVersion: unknown;
    }
  | { type: "invalid-document" }
  | {
      type: "invalid-graph";
      rejection: AddComponentRejection | AddConnectionRejection;
    }
  | { type: "invalid-node-positions" };

export type RestoreArchitectureEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RestoreArchitectureEditorStateError };

type PersistedComponent =
  PersistedArchitectureEditorDocumentV1["graph"]["components"][number];
type PersistedConnection =
  PersistedArchitectureEditorDocumentV1["graph"]["connections"][number];
type PersistedNodePosition =
  PersistedArchitectureEditorDocumentV1["nodePositions"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPersistedComponent(value: unknown): value is PersistedComponent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isPersistedConnection(
  value: unknown,
): value is PersistedConnection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceComponentId === "string" &&
    typeof value.targetComponentId === "string"
  );
}

function isPersistedNodePosition(
  value: unknown,
): value is PersistedNodePosition {
  return (
    isRecord(value) &&
    typeof value.componentId === "string" &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

function invalidDocument(): RestoreArchitectureEditorStateResult {
  return { ok: false, error: { type: "invalid-document" } };
}

function invalidNodePositions(): RestoreArchitectureEditorStateResult {
  return { ok: false, error: { type: "invalid-node-positions" } };
}

export function toPersistedArchitectureEditorDocument(
  state: Pick<ArchitectureEditorState, "graph" | "nodePositions">,
): PersistedArchitectureEditorDocumentV1 {
  const components = state.graph.getComponents();
  const connections = state.graph.getConnections();
  const componentIds = new Set(components.map((component) => component.id));

  if (
    state.nodePositions.size !== componentIds.size ||
    Array.from(state.nodePositions.keys()).some(
      (componentId) => !componentIds.has(componentId),
    )
  ) {
    throw new Error(
      "Architecture editor state must contain exactly one node position per component.",
    );
  }

  const nodePositions = components.map((component) => {
    const position = state.nodePositions.get(component.id);

    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new Error(
        `Architecture component "${component.id}" must have a finite node position.`,
      );
    }

    return {
      componentId: component.id,
      x: position.x,
      y: position.y,
    };
  });

  return {
    schemaVersion: ARCHITECTURE_EDITOR_DOCUMENT_SCHEMA_VERSION,
    graph: {
      components: components.map((component) => ({
        id: component.id,
        name: component.name,
      })),
      connections: connections.map((connection) => ({
        id: connection.id,
        sourceComponentId: connection.sourceComponentId,
        targetComponentId: connection.targetComponentId,
      })),
    },
    nodePositions,
  };
}

export function restoreArchitectureEditorState(
  value: unknown,
): RestoreArchitectureEditorStateResult {
  if (!isRecord(value) || !hasOwn(value, "schemaVersion")) {
    return invalidDocument();
  }

  if (
    value.schemaVersion !== ARCHITECTURE_EDITOR_DOCUMENT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      error: {
        type: "unsupported-schema-version",
        schemaVersion: value.schemaVersion,
      },
    };
  }

  if (
    !isRecord(value.graph) ||
    !Array.isArray(value.graph.components) ||
    !value.graph.components.every(isPersistedComponent) ||
    !Array.isArray(value.graph.connections) ||
    !value.graph.connections.every(isPersistedConnection) ||
    !Array.isArray(value.nodePositions) ||
    !value.nodePositions.every(isPersistedNodePosition)
  ) {
    return invalidDocument();
  }

  if (
    value.nodePositions.some(
      (position) =>
        !Number.isFinite(position.x) || !Number.isFinite(position.y),
    )
  ) {
    return invalidNodePositions();
  }

  let graph = ArchitectureGraph.empty();

  for (const persistedComponent of value.graph.components) {
    const component: ArchitectureComponent = {
      id: persistedComponent.id as ComponentId,
      name: persistedComponent.name,
    };
    const result = graph.addComponent(component);

    if (!result.ok) {
      return {
        ok: false,
        error: { type: "invalid-graph", rejection: result.error },
      };
    }

    graph = result.graph;
  }

  for (const persistedConnection of value.graph.connections) {
    const connection: ArchitectureConnection = {
      id: persistedConnection.id as ConnectionId,
      sourceComponentId:
        persistedConnection.sourceComponentId as ComponentId,
      targetComponentId:
        persistedConnection.targetComponentId as ComponentId,
    };
    const result = graph.addConnection(connection);

    if (!result.ok) {
      return {
        ok: false,
        error: { type: "invalid-graph", rejection: result.error },
      };
    }

    graph = result.graph;
  }

  const componentIds = new Set(
    graph.getComponents().map((component) => component.id),
  );
  const nodePositions = new Map<
    ComponentId,
    Readonly<{ x: number; y: number }>
  >();

  for (const persistedPosition of value.nodePositions) {
    const componentId = persistedPosition.componentId as ComponentId;

    if (!componentIds.has(componentId) || nodePositions.has(componentId)) {
      return invalidNodePositions();
    }

    nodePositions.set(componentId, {
      x: persistedPosition.x,
      y: persistedPosition.y,
    });
  }

  if (nodePositions.size !== componentIds.size) {
    return invalidNodePositions();
  }

  return {
    ok: true,
    state: {
      graph,
      nodePositions,
      nodeMeasurements: new Map(),
    },
  };
}
