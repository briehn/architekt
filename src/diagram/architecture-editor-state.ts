import type { NodeChange } from "@xyflow/react";

import type { ArchitectureBoundary } from "../domain/architecture-boundary";
import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import type {
  AddBoundaryRejection,
  AddComponentRejection,
  AddConnectionRejection,
  ArchitectureGraph,
  AssignComponentToBoundaryRejection,
  ChangeComponentKindRejection,
  ChangeConnectionKindRejection,
  RenameComponentRejection,
  RemoveBoundaryRejection,
  RemoveComponentRejection,
  RemoveConnectionRejection,
  RenameBoundaryRejection,
} from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import {
  layoutArchitectureGraph,
  layoutBoundaryAwareArchitectureGraph,
  type DiagramNodeSize,
  type DiagramNodeSizes,
} from "./auto-layout";
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

export type AddBoundaryToEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: AddBoundaryRejection };

export type RenameBoundaryInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RenameBoundaryRejection };

export type RemoveBoundaryFromEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RemoveBoundaryRejection };

export type AssignComponentToBoundaryInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: AssignComponentToBoundaryRejection };

export type AutoLayoutArchitectureEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: { type: "layout-failed" } };

export function createArchitectureEditorState(
  graph: ArchitectureGraph,
): ArchitectureEditorState {
  return {
    graph,
    nodePositions: createInitialDiagramNodePositions(graph),
    nodeMeasurements: new Map(),
  };
}

export function createFreshArchitectureEditorState(
  graph: ArchitectureGraph,
): ArchitectureEditorState {
  const rowPlacementFallbackState = createArchitectureEditorState(graph);
  const layoutResult = autoLayoutArchitectureEditorState(
    rowPlacementFallbackState,
  );

  return layoutResult.ok ? layoutResult.state : rowPlacementFallbackState;
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

export function autoLayoutArchitectureEditorState(
  state: ArchitectureEditorState,
): AutoLayoutArchitectureEditorStateResult {
  const layout = state.graph.getBoundaries().some((boundary) => boundary.memberComponentIds.length > 0)
    ? layoutBoundaryAwareArchitectureGraph
    : layoutArchitectureGraph;
  const layoutResult = layout(
    state.graph,
    projectKnownNodeSizes(state),
  );

  if (!layoutResult.ok) {
    return layoutResult;
  }

  if (
    haveEqualDiagramNodePositions(
      state.nodePositions,
      layoutResult.nodePositions,
    )
  ) {
    return { ok: true, state };
  }

  return {
    ok: true,
    state: {
      graph: state.graph,
      nodePositions: layoutResult.nodePositions,
      nodeMeasurements: state.nodeMeasurements,
    },
  };
}

export function projectKnownNodeSizes(
  state: ArchitectureEditorState,
): DiagramNodeSizes {
  const knownNodeSizes = new Map<ComponentId, DiagramNodeSize>();

  for (const component of state.graph.getComponents()) {
    const measurement = state.nodeMeasurements.get(component.id);

    if (!measurement) {
      continue;
    }

    knownNodeSizes.set(component.id, {
      width: measurement.width,
      height: measurement.height,
    });
  }

  return knownNodeSizes;
}

function haveEqualDiagramNodePositions(
  first: DiagramNodePositions,
  second: DiagramNodePositions,
): boolean {
  if (first === second) {
    return true;
  }

  if (first.size !== second.size) {
    return false;
  }

  for (const [componentId, firstPosition] of first) {
    const secondPosition = second.get(componentId);

    if (
      !secondPosition ||
      firstPosition.x !== secondPosition.x ||
      firstPosition.y !== secondPosition.y
    ) {
      return false;
    }
  }

  return true;
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

function withBoundaryGraph(
  state: ArchitectureEditorState,
  graph: ArchitectureGraph,
): ArchitectureEditorState {
  return graph === state.graph
    ? state
    : {
        graph,
        nodePositions: state.nodePositions,
        nodeMeasurements: state.nodeMeasurements,
      };
}

export function addBoundaryToEditorState(
  state: ArchitectureEditorState,
  boundary: ArchitectureBoundary,
): AddBoundaryToEditorStateResult {
  const result = state.graph.addBoundary(boundary);
  return result.ok
    ? { ok: true, state: withBoundaryGraph(state, result.graph) }
    : result;
}

export function renameBoundaryInEditorState(
  state: ArchitectureEditorState,
  boundaryId: BoundaryId,
  name: string,
): RenameBoundaryInEditorStateResult {
  const result = state.graph.renameBoundary(boundaryId, name);
  return result.ok
    ? { ok: true, state: withBoundaryGraph(state, result.graph) }
    : result;
}

export function removeBoundaryFromEditorState(
  state: ArchitectureEditorState,
  boundaryId: BoundaryId,
): RemoveBoundaryFromEditorStateResult {
  const result = state.graph.removeBoundary(boundaryId);
  return result.ok
    ? { ok: true, state: withBoundaryGraph(state, result.graph) }
    : result;
}

export function assignComponentToBoundaryInEditorState(
  state: ArchitectureEditorState,
  componentId: ComponentId,
  boundaryId: BoundaryId | null,
): AssignComponentToBoundaryInEditorStateResult {
  const result = state.graph.assignComponentToBoundary(componentId, boundaryId);
  return result.ok
    ? { ok: true, state: withBoundaryGraph(state, result.graph) }
    : result;
}
