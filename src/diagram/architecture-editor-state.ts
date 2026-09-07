import type { NodeChange } from "@xyflow/react";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type {
  AddComponentRejection,
  ArchitectureGraph,
  RemoveComponentRejection,
} from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
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

export type RemoveComponentFromEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: RemoveComponentRejection };

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
