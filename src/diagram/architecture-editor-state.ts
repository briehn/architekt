import type { NodeChange } from "@xyflow/react";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import type {
  AddComponentRejection,
  AddConnectionRejection,
  ArchitectureGraph,
  ChangeComponentKindRejection,
  ChangeConnectionKindRejection,
  RenameComponentRejection,
  RemoveComponentRejection,
  RemoveConnectionRejection,
} from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addDiagramNodePosition,
  createInitialDiagramNodePositions,
  createNextDiagramNodePosition,
  type DiagramNodePositions,
  removeDiagramNodePosition,
} from "./diagram-layout";
import {
  applyReactFlowNodeMeasurementChanges,
  applyReactFlowNodePositionChanges,
  type ReactFlowNodeMeasurements,
  removeReactFlowNodeMeasurement,
} from "./react-flow-adapter";

export type ArchitectureEditorState = {
  readonly graph: ArchitectureGraph;
  readonly nodePositions: DiagramNodePositions;
  readonly nodeMeasurements: ReactFlowNodeMeasurements;
};

export type AddComponentToEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: AddComponentRejection };

export type AddConnectionToEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: AddConnectionRejection };

export type RemoveComponentFromEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RemoveComponentRejection };

export type RenameComponentInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RenameComponentRejection };

export type ChangeComponentKindInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: ChangeComponentKindRejection };

export type ChangeConnectionKindInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: ChangeConnectionKindRejection };

export type RemoveConnectionFromEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RemoveConnectionRejection };

export function createArchitectureEditorState(
  graph: ArchitectureGraph,
): ArchitectureEditorState {
  return {
    graph,
    nodePositions: createInitialDiagramNodePositions(graph),
    nodeMeasurements: new Map(),
  };
}

export function applyReactFlowNodeChangesToEditorState(
  state: ArchitectureEditorState,
  changes: readonly NodeChange[],
): ArchitectureEditorState {
  const nodePositions = applyReactFlowNodePositionChanges(
    state.nodePositions,
    changes,
  );
  const nodeMeasurements = applyReactFlowNodeMeasurementChanges(
    state.nodeMeasurements,
    changes,
  );

  if (
    nodePositions === state.nodePositions &&
    nodeMeasurements === state.nodeMeasurements
  ) {
    return state;
  }

  return {
    graph: state.graph,
    nodePositions,
    nodeMeasurements,
  };
}

export function addComponentToEditorState(
  state: ArchitectureEditorState,
  component: ArchitectureComponent,
): AddComponentToEditorStateResult {
  const graphResult = state.graph.addComponent(component);

  if (!graphResult.ok) {
    return graphResult;
  }

  const position = createNextDiagramNodePosition(state.nodePositions);
  const nodePositions = addDiagramNodePosition(
    state.nodePositions,
    component.id,
    position,
  );

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function renameComponentInEditorState(
  state: ArchitectureEditorState,
  componentId: ComponentId,
  name: ArchitectureComponent["name"],
): RenameComponentInEditorStateResult {
  const graphResult = state.graph.renameComponent(componentId, name);

  if (!graphResult.ok) {
    return graphResult;
  }

  if (graphResult.graph === state.graph) {
    return { ok: true, state };
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: state.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function changeComponentKindInEditorState(
  state: ArchitectureEditorState,
  componentId: ComponentId,
  kind: ArchitectureComponentKind,
): ChangeComponentKindInEditorStateResult {
  const graphResult = state.graph.changeComponentKind(componentId, kind);

  if (!graphResult.ok) {
    return graphResult;
  }

  if (graphResult.graph === state.graph) {
    return { ok: true, state };
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: state.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function changeConnectionKindInEditorState(
  state: ArchitectureEditorState,
  connectionId: ConnectionId,
  kind: ArchitectureConnectionKind,
): ChangeConnectionKindInEditorStateResult {
  const graphResult = state.graph.changeConnectionKind(connectionId, kind);

  if (!graphResult.ok) {
    return graphResult;
  }

  if (graphResult.graph === state.graph) {
    return { ok: true, state };
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: state.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function addConnectionToEditorState(
  state: ArchitectureEditorState,
  connection: ArchitectureConnection,
): AddConnectionToEditorStateResult {
  const graphResult = state.graph.addConnection(connection);

  if (!graphResult.ok) {
    return graphResult;
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: state.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function removeConnectionFromEditorState(
  state: ArchitectureEditorState,
  connectionId: ConnectionId,
): RemoveConnectionFromEditorStateResult {
  const graphResult = state.graph.removeConnection(connectionId);

  if (!graphResult.ok) {
    return graphResult;
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: state.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function removeComponentFromEditorState(
  state: ArchitectureEditorState,
  componentId: ComponentId,
): RemoveComponentFromEditorStateResult {
  const graphResult = state.graph.removeComponent(componentId);

  if (!graphResult.ok) {
    return graphResult;
  }

  return {
    ok: true,
    state: {
      graph: graphResult.graph,
      nodePositions: removeDiagramNodePosition(
        state.nodePositions,
        componentId,
      ),
      nodeMeasurements: removeReactFlowNodeMeasurement(
        state.nodeMeasurements,
        componentId,
      ),
    },
  };
}
