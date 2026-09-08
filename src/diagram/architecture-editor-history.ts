import type { ArchitectureEditorState } from "./architecture-editor-state";

export type ArchitectureEditorHistorySnapshot = Readonly<
  Pick<ArchitectureEditorState, "graph" | "nodePositions">
>;

export type ArchitectureEditorHistory = Readonly<{
  past: readonly ArchitectureEditorHistorySnapshot[];
  present: ArchitectureEditorState;
  future: readonly ArchitectureEditorHistorySnapshot[];
}>;

export const ARCHITECTURE_EDITOR_HISTORY_LIMIT = 100;

function toHistorySnapshot(
  state: ArchitectureEditorState,
): ArchitectureEditorHistorySnapshot {
  return {
    graph: state.graph,
    nodePositions: state.nodePositions,
  };
}

function hasRecordableChange(
  currentState: ArchitectureEditorState,
  nextState: ArchitectureEditorState,
): boolean {
  return (
    currentState.graph !== nextState.graph ||
    currentState.nodePositions !== nextState.nodePositions
  );
}

function isCompleteNoOp(
  currentState: ArchitectureEditorState,
  nextState: ArchitectureEditorState,
): boolean {
  return (
    currentState.graph === nextState.graph &&
    currentState.nodePositions === nextState.nodePositions &&
    currentState.nodeMeasurements === nextState.nodeMeasurements
  );
}

function appendPastSnapshot(
  past: readonly ArchitectureEditorHistorySnapshot[],
  snapshot: ArchitectureEditorHistorySnapshot,
): readonly ArchitectureEditorHistorySnapshot[] {
  return [...past, snapshot].slice(-ARCHITECTURE_EDITOR_HISTORY_LIMIT);
}

function restoreHistorySnapshot(
  snapshot: ArchitectureEditorHistorySnapshot,
  currentState: ArchitectureEditorState,
): ArchitectureEditorState {
  const restoredComponentIds = new Set<string>(
    snapshot.graph.getComponents().map((component) => component.id),
  );
  const hasOrphanMeasurement = Array.from(
    currentState.nodeMeasurements.keys(),
  ).some((componentId) => !restoredComponentIds.has(componentId));

  const nodeMeasurements = hasOrphanMeasurement
    ? new Map(
        Array.from(currentState.nodeMeasurements.entries()).filter(
          ([componentId]) => restoredComponentIds.has(componentId),
        ),
      )
    : currentState.nodeMeasurements;

  return {
    graph: snapshot.graph,
    nodePositions: snapshot.nodePositions,
    nodeMeasurements,
  };
}

export function createArchitectureEditorHistory(
  initialState: ArchitectureEditorState,
): ArchitectureEditorHistory {
  return {
    past: [],
    present: initialState,
    future: [],
  };
}

export function recordArchitectureEditorState(
  history: ArchitectureEditorHistory,
  nextState: ArchitectureEditorState,
): ArchitectureEditorHistory {
  if (isCompleteNoOp(history.present, nextState)) {
    return history;
  }

  if (!hasRecordableChange(history.present, nextState)) {
    return {
      past: history.past,
      present: nextState,
      future: history.future,
    };
  }

  return {
    past: appendPastSnapshot(
      history.past,
      toHistorySnapshot(history.present),
    ),
    present: nextState,
    future: [],
  };
}

export function replaceArchitectureEditorStateWithoutHistory(
  history: ArchitectureEditorHistory,
  nextState: ArchitectureEditorState,
): ArchitectureEditorHistory {
  if (isCompleteNoOp(history.present, nextState)) {
    return history;
  }

  return {
    past: history.past,
    present: nextState,
    future: history.future,
  };
}

export function undoArchitectureEditorHistory(
  history: ArchitectureEditorHistory,
): ArchitectureEditorHistory {
  const snapshot = history.past.at(-1);

  if (!snapshot) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: restoreHistorySnapshot(snapshot, history.present),
    future: [toHistorySnapshot(history.present), ...history.future],
  };
}

export function redoArchitectureEditorHistory(
  history: ArchitectureEditorHistory,
): ArchitectureEditorHistory {
  const snapshot = history.future[0];

  if (!snapshot) {
    return history;
  }

  return {
    past: appendPastSnapshot(
      history.past,
      toHistorySnapshot(history.present),
    ),
    present: restoreHistorySnapshot(snapshot, history.present),
    future: history.future.slice(1),
  };
}

export function canUndoArchitectureEditorHistory(
  history: ArchitectureEditorHistory,
): boolean {
  return history.past.length > 0;
}

export function canRedoArchitectureEditorHistory(
  history: ArchitectureEditorHistory,
): boolean {
  return history.future.length > 0;
}

export function clearArchitectureEditorHistory(
  history: ArchitectureEditorHistory,
): ArchitectureEditorHistory {
  if (history.past.length === 0 && history.future.length === 0) {
    return history;
  }

  return {
    past: [],
    present: history.present,
    future: [],
  };
}
