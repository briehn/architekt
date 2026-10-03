import type { ArchitectureBoundary } from "../domain/architecture-boundary";
import { EMPTY_DESIGN_CONTEXT, validateDesignContext, type DesignContext } from "../application/design-context";
import {
  isArchitectureComponentKind,
  type ArchitectureComponent,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import {
  isArchitectureConnectionKind,
  type ArchitectureConnection,
  type ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import {
  type AddBoundaryRejection,
  type AddComponentRejection,
  type AddConnectionRejection,
  ArchitectureGraph,
} from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";

export const ARCHITECTURE_EDITOR_DOCUMENT_SCHEMA_VERSION = 5;

type PersistedArchitectureConnectionV1V2 = Readonly<{
  id: string;
  sourceComponentId: string;
  targetComponentId: string;
}>;

type PersistedArchitectureConnectionV3 = Readonly<{
  id: string;
  sourceComponentId: string;
  targetComponentId: string;
  kind: ArchitectureConnectionKind;
}>;

type PersistedNodePosition = Readonly<{
  componentId: string;
  x: number;
  y: number;
}>;

type PersistedArchitectureEditorDocument<
  SchemaVersion extends 1 | 2 | 3,
  PersistedComponent,
  PersistedConnection,
> = Readonly<{
  schemaVersion: SchemaVersion;
  graph: Readonly<{
    components: ReadonlyArray<Readonly<PersistedComponent>>;
    connections: ReadonlyArray<Readonly<PersistedConnection>>;
  }>;
  nodePositions: ReadonlyArray<PersistedNodePosition>;
}>;

export type PersistedArchitectureEditorDocumentV1 =
  PersistedArchitectureEditorDocument<
    1,
    { id: string; name: string },
    PersistedArchitectureConnectionV1V2
  >;

export type PersistedArchitectureEditorDocumentV2 =
  PersistedArchitectureEditorDocument<
    2,
    { id: string; name: string; kind: ArchitectureComponentKind },
    PersistedArchitectureConnectionV1V2
  >;

export type PersistedArchitectureEditorDocumentV3 =
  PersistedArchitectureEditorDocument<
    3,
    { id: string; name: string; kind: ArchitectureComponentKind },
    PersistedArchitectureConnectionV3
  >;

export type PersistedArchitectureBoundaryV4 = Readonly<{
  id: string;
  name: string;
  memberComponentIds: readonly string[];
}>;

export type PersistedArchitectureEditorDocumentV4 = Readonly<{
  schemaVersion: 4;
  graph: Readonly<{
    components: PersistedArchitectureEditorDocumentV3["graph"]["components"];
    connections: PersistedArchitectureEditorDocumentV3["graph"]["connections"];
    boundaries: readonly PersistedArchitectureBoundaryV4[];
  }>;
  nodePositions: PersistedArchitectureEditorDocumentV3["nodePositions"];
}>;

export type PersistedArchitectureEditorDocumentV5 = Readonly<{
  schemaVersion: 5;
  designContext: DesignContext;
  graph: PersistedArchitectureEditorDocumentV4["graph"];
  nodePositions: PersistedArchitectureEditorDocumentV4["nodePositions"];
}>;

export type RestoreArchitectureEditorStateError =
  | {
      type: "unsupported-schema-version";
      schemaVersion: unknown;
    }
  | { type: "invalid-document" }
  | {
      type: "invalid-graph";
      rejection: AddComponentRejection | AddConnectionRejection | AddBoundaryRejection;
    }
  | { type: "invalid-node-positions" };

export type RestoreArchitectureEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RestoreArchitectureEditorStateError };

type PersistedComponentV1 =
  PersistedArchitectureEditorDocumentV1["graph"]["components"][number];
type PersistedComponentV2 =
  PersistedArchitectureEditorDocumentV2["graph"]["components"][number];
type PersistedConnectionV1V2 =
  PersistedArchitectureEditorDocumentV1["graph"]["connections"][number];
type PersistedConnectionV3 =
  PersistedArchitectureEditorDocumentV3["graph"]["connections"][number];
type PersistedBoundaryV4 =
  PersistedArchitectureEditorDocumentV4["graph"]["boundaries"][number];
type PersistedConnectionRecord = Record<string, unknown> &
  PersistedConnectionV1V2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasExactKeys(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => hasOwn(value, key));
}

function isPersistedComponentV1(
  value: unknown,
): value is PersistedComponentV1 {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isPersistedComponentV2(
  value: unknown,
): value is PersistedComponentV2 {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isArchitectureComponentKind(value.kind)
  );
}

function hasPersistedConnectionFields(
  value: unknown,
): value is PersistedConnectionRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceComponentId === "string" &&
    typeof value.targetComponentId === "string"
  );
}

function isPersistedConnectionV1V2(
  value: unknown,
): value is PersistedConnectionV1V2 {
  return hasPersistedConnectionFields(value);
}

function isPersistedConnectionV3(
  value: unknown,
): value is PersistedConnectionV3 {
  return (
    hasPersistedConnectionFields(value) &&
    isArchitectureConnectionKind(value.kind)
  );
}

function isPersistedBoundaryV4(value: unknown): value is PersistedBoundaryV4 {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    hasOwn(value, "id") &&
    hasOwn(value, "name") &&
    hasOwn(value, "memberComponentIds") &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.memberComponentIds) &&
    value.memberComponentIds.every((memberId) => typeof memberId === "string")
  );
}

function migrateLegacyConnections(
  connections: readonly PersistedConnectionV1V2[],
): readonly PersistedConnectionV3[] {
  return connections.map((connection) => ({
    ...connection,
    kind: "generic",
  }));
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
  state: Pick<ArchitectureEditorState, "graph" | "nodePositions" | "designContext">,
): PersistedArchitectureEditorDocumentV5 {
  const contextResult = validateDesignContext(state.designContext);
  if (!contextResult.ok) {
    throw new Error("Architecture editor state contains invalid design context.");
  }
  const components = state.graph.getComponents();
  const connections = state.graph.getConnections();
  const boundaries = state.graph.getBoundaries();
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
    designContext: { ...contextResult.context },
    graph: {
      components: components.map((component) => ({
        id: component.id,
        name: component.name,
        kind: component.kind,
      })),
      connections: connections.map((connection) => ({
        id: connection.id,
        sourceComponentId: connection.sourceComponentId,
        targetComponentId: connection.targetComponentId,
        kind: connection.kind,
      })),
      boundaries: boundaries.map((boundary) => ({
        id: boundary.id,
        name: boundary.name,
        memberComponentIds: [...boundary.memberComponentIds],
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
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== 4 &&
    value.schemaVersion !== 5
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
    !Array.isArray(value.graph.connections) ||
    !Array.isArray(value.nodePositions) ||
    !value.nodePositions.every(isPersistedNodePosition)
  ) {
    return invalidDocument();
  }

  if (value.schemaVersion === 5 && (
    !hasExactKeys(value, ["schemaVersion", "designContext", "graph", "nodePositions"]) ||
    !hasExactKeys(value.graph, ["components", "connections", "boundaries"]) ||
    !value.graph.components.every((component) => hasExactKeys(component, ["id", "name", "kind"])) ||
    !value.graph.connections.every((connection) => hasExactKeys(connection, ["id", "sourceComponentId", "targetComponentId", "kind"])) ||
    !value.nodePositions.every((position) => hasExactKeys(position, ["componentId", "x", "y"]))
  )) {
    return invalidDocument();
  }

  let designContext = EMPTY_DESIGN_CONTEXT;
  if (value.schemaVersion === 5) {
    const result = validateDesignContext(value.designContext);
    if (!result.ok) return invalidDocument();
    designContext = result.context;
  }

  let persistedComponents: readonly PersistedComponentV2[];

  if (value.schemaVersion === 1) {
    if (!value.graph.components.every(isPersistedComponentV1)) {
      return invalidDocument();
    }

    persistedComponents = value.graph.components.map((component) => ({
      id: component.id,
      name: component.name,
      kind: "generic",
    }));
  } else {
    if (!value.graph.components.every(isPersistedComponentV2)) {
      return invalidDocument();
    }

    persistedComponents = value.graph.components;
  }

  let persistedConnections: readonly PersistedConnectionV3[];

  if (value.schemaVersion === 3 || value.schemaVersion === 4 || value.schemaVersion === 5) {
    if (!value.graph.connections.every(isPersistedConnectionV3)) {
      return invalidDocument();
    }

    persistedConnections = value.graph.connections;
  } else {
    if (!value.graph.connections.every(isPersistedConnectionV1V2)) {
      return invalidDocument();
    }

    persistedConnections = migrateLegacyConnections(
      value.graph.connections,
    );
  }

  let persistedBoundaries: readonly PersistedBoundaryV4[] = [];
  if (value.schemaVersion === 4 || value.schemaVersion === 5) {
    if (
      !Array.isArray(value.graph.boundaries) ||
      !value.graph.boundaries.every(isPersistedBoundaryV4)
    ) {
      return invalidDocument();
    }
    persistedBoundaries = value.graph.boundaries;
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

  for (const persistedComponent of persistedComponents) {
    const component: ArchitectureComponent = {
      id: persistedComponent.id as ComponentId,
      name: persistedComponent.name,
      kind: persistedComponent.kind,
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

  for (const persistedConnection of persistedConnections) {
    const connection: ArchitectureConnection = {
      id: persistedConnection.id as ConnectionId,
      sourceComponentId:
        persistedConnection.sourceComponentId as ComponentId,
      targetComponentId:
        persistedConnection.targetComponentId as ComponentId,
      kind: persistedConnection.kind,
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

  for (const persistedBoundary of persistedBoundaries) {
    const boundary: ArchitectureBoundary = {
      id: persistedBoundary.id as BoundaryId,
      name: persistedBoundary.name,
      memberComponentIds: persistedBoundary.memberComponentIds.map(
        (componentId) => componentId as ComponentId,
      ),
    };
    const result = graph.addBoundary(boundary);

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
      designContext,
      nodeMeasurements: new Map(),
    },
  };
}
