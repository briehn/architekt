import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import type { ArchitectureConnection } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
} from "./architecture-editor-state";
import {
  ARCHITECTURE_EDITOR_HISTORY_LIMIT,
  canRedoArchitectureEditorHistory,
  canUndoArchitectureEditorHistory,
  clearArchitectureEditorHistory,
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  replaceArchitectureEditorStateWithoutHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import { moveDiagramNode } from "./diagram-layout";

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
  sourceComponentId: ComponentId,
  targetComponentId: ComponentId,
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId,
    targetComponentId,
  };
}

function graphWithComponents(
  ...components: ArchitectureComponent[]
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();

  for (const architectureComponent of components) {
    const result = graph.addComponent(architectureComponent);
    if (!result.ok) throw new Error("Expected component to be added.");
    graph = result.graph;
  }

  return graph;
}

type EditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: unknown };

function expectEditorStateSuccess(
  result: EditorStateResult,
): ArchitectureEditorState {
  if (!result.ok) throw new Error("Expected editor-state operation to succeed.");
  return result.state;
}

const api = component("api", "API");
const database = component("database", "Database");
const apiToDatabase = connection(
  "api-to-database",
  api.id,
  database.id,
);

function initialState(
  ...components: ArchitectureComponent[]
): ArchitectureEditorState {
  return createArchitectureEditorState(graphWithComponents(...components));
}

describe("ArchitectureEditorHistory", () => {
  it("creates an initial history around the supplied state", () => {
    const state = initialState(api);
    const history = createArchitectureEditorHistory(state);

    expect(history).toEqual({ past: [], present: state, future: [] });
    expect(history.present).toBe(state);
    expect(canUndoArchitectureEditorHistory(history)).toBe(false);
    expect(canRedoArchitectureEditorHistory(history)).toBe(false);
  });

  it("records an accepted graph edit without storing measurements", () => {
    const state = initialState(api);
    const measurement = { width: 176, height: 48 };
    const measuredState: ArchitectureEditorState = {
      ...state,
      nodeMeasurements: new Map([[api.id, measurement]]),
    };
    const nextState = expectEditorStateSuccess(
      addComponentToEditorState(measuredState, database),
    );

    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(measuredState),
      nextState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.graph).toBe(measuredState.graph);
    expect(history.past[0]?.nodePositions).toBe(
      measuredState.nodePositions,
    );
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    expect(history.present).toBe(nextState);
    expect(canUndoArchitectureEditorHistory(history)).toBe(true);
  });

  it("records an accepted position edit", () => {
    const state = initialState(api);
    const movedState: ArchitectureEditorState = {
      ...state,
      nodePositions: moveDiagramNode(state.nodePositions, api.id, {
        x: 120,
        y: 80,
      }),
    };

    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      movedState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.graph).toBe(state.graph);
    expect(history.past[0]?.nodePositions).toBe(state.nodePositions);
    expect(history.present.nodePositions).toBe(movedState.nodePositions);
  });

  it("updates measurements without recording or clearing redo", () => {
    const state = initialState(api);
    const movedState: ArchitectureEditorState = {
      ...state,
      nodePositions: moveDiagramNode(state.nodePositions, api.id, {
        x: 120,
        y: 80,
      }),
    };
    const undoneHistory = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        movedState,
      ),
    );
    const measurement = { width: 176, height: 48 };
    const measuredState: ArchitectureEditorState = {
      ...undoneHistory.present,
      nodeMeasurements: new Map([[api.id, measurement]]),
    };

    const history = recordArchitectureEditorState(
      undoneHistory,
      measuredState,
    );

    expect(history.present).toBe(measuredState);
    expect(history.past).toBe(undoneHistory.past);
    expect(history.future).toBe(undoneHistory.future);
    expect(history.future).toHaveLength(1);
    expect(canRedoArchitectureEditorHistory(history)).toBe(true);
  });

  it("preserves the history reference for complete no-ops", () => {
    const history = createArchitectureEditorHistory(initialState(api));
    const equivalentState = { ...history.present };

    expect(recordArchitectureEditorState(history, equivalentState)).toBe(
      history,
    );
    expect(
      replaceArchitectureEditorStateWithoutHistory(
        history,
        equivalentState,
      ),
    ).toBe(history);
  });

  it("replaces present state without changing either history stack", () => {
    const state = initialState(api);
    const movedState: ArchitectureEditorState = {
      ...state,
      nodePositions: moveDiagramNode(state.nodePositions, api.id, {
        x: 120,
        y: 80,
      }),
    };
    const history = createArchitectureEditorHistory(state);

    const replacedHistory = replaceArchitectureEditorStateWithoutHistory(
      history,
      movedState,
    );

    expect(replacedHistory.present).toBe(movedState);
    expect(replacedHistory.past).toBe(history.past);
    expect(replacedHistory.future).toBe(history.future);
    expect(canUndoArchitectureEditorHistory(replacedHistory)).toBe(false);
  });

  it("undoes and redoes graph and position snapshots", () => {
    const state = initialState(api);
    const movedState: ArchitectureEditorState = {
      ...state,
      nodePositions: moveDiagramNode(state.nodePositions, api.id, {
        x: 120,
        y: 80,
      }),
    };
    const recordedHistory = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      movedState,
    );

    const undoneHistory = undoArchitectureEditorHistory(recordedHistory);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph).toBe(state.graph);
    expect(undoneHistory.present.nodePositions).toBe(state.nodePositions);
    expect(canRedoArchitectureEditorHistory(undoneHistory)).toBe(true);
    expect(redoneHistory.present.graph).toBe(movedState.graph);
    expect(redoneHistory.present.nodePositions).toBe(
      movedState.nodePositions,
    );
    expect(canUndoArchitectureEditorHistory(redoneHistory)).toBe(true);
    expect(canRedoArchitectureEditorHistory(redoneHistory)).toBe(false);
  });

  it("treats undo at the beginning and redo at the end as no-ops", () => {
    const history = createArchitectureEditorHistory(initialState(api));

    expect(undoArchitectureEditorHistory(history)).toBe(history);
    expect(redoArchitectureEditorHistory(history)).toBe(history);
  });

  it("clears redo after a new graph or position edit", () => {
    const state = initialState(api);
    const movedState: ArchitectureEditorState = {
      ...state,
      nodePositions: moveDiagramNode(state.nodePositions, api.id, {
        x: 120,
        y: 80,
      }),
    };
    const undoneHistory = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        movedState,
      ),
    );
    const differentMove: ArchitectureEditorState = {
      ...undoneHistory.present,
      nodePositions: moveDiagramNode(
        undoneHistory.present.nodePositions,
        api.id,
        { x: 40, y: 160 },
      ),
    };

    const history = recordArchitectureEditorState(
      undoneHistory,
      differentMove,
    );

    expect(history.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(history)).toBe(false);
  });

  it("restores a deleted component, its position, and its connection", () => {
    const graph = graphWithComponents(api, database);
    const connectionResult = graph.addConnection(apiToDatabase);
    if (!connectionResult.ok) throw new Error("Expected connection to be added.");
    const state: ArchitectureEditorState = {
      ...createArchitectureEditorState(connectionResult.graph),
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
        [database.id, { width: 204, height: 56 }],
      ]),
    };
    const deletedState = expectEditorStateSuccess(
      removeComponentFromEditorState(state, database.id),
    );
    const recordedHistory = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      deletedState,
    );

    const undoneHistory = undoArchitectureEditorHistory(recordedHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(undoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
    ]);
    expect(undoneHistory.present.nodePositions).toBe(state.nodePositions);
    expect(undoneHistory.present.nodeMeasurements.has(api.id)).toBe(true);
    expect(undoneHistory.present.nodeMeasurements.has(database.id)).toBe(
      false,
    );

    const remeasuredHistory = replaceArchitectureEditorStateWithoutHistory(
      undoneHistory,
      {
        ...undoneHistory.present,
        nodeMeasurements: new Map([
          [api.id, { width: 176, height: 48 }],
          [database.id, { width: 204, height: 56 }],
        ]),
      },
    );
    const redoneHistory = redoArchitectureEditorHistory(remeasuredHistory);

    expect(redoneHistory.present.graph.getComponents()).toEqual([api]);
    expect(redoneHistory.present.nodeMeasurements.has(api.id)).toBe(true);
    expect(redoneHistory.present.nodeMeasurements.has(database.id)).toBe(
      false,
    );
  });

  it("undoes and redoes connection additions and removals", () => {
    const state = initialState(api, database);
    const connectedState = expectEditorStateSuccess(
      addConnectionToEditorState(state, apiToDatabase),
    );
    const addedHistory = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      connectedState,
    );

    expect(
      undoArchitectureEditorHistory(addedHistory).present.graph.getConnections(),
    ).toEqual([]);
    const redoneAddition = redoArchitectureEditorHistory(
      undoArchitectureEditorHistory(addedHistory),
    );
    expect(redoneAddition.present.graph.getConnections()).toEqual([
      apiToDatabase,
    ]);

    const disconnectedState = expectEditorStateSuccess(
      removeConnectionFromEditorState(
        redoneAddition.present,
        apiToDatabase.id,
      ),
    );
    const removedHistory = recordArchitectureEditorState(
      redoneAddition,
      disconnectedState,
    );

    expect(
      undoArchitectureEditorHistory(removedHistory).present.graph.getConnections(),
    ).toEqual([apiToDatabase]);
    expect(
      redoArchitectureEditorHistory(
        undoArchitectureEditorHistory(removedHistory),
      ).present.graph.getConnections(),
    ).toEqual([]);
  });

  it("prunes measurements for components absent from a restored graph", () => {
    const state = initialState(api);
    const addedState = expectEditorStateSuccess(
      addComponentToEditorState(state, database),
    );
    const apiMeasurement = { width: 176, height: 48 };
    const measuredAddedState: ArchitectureEditorState = {
      ...addedState,
      nodeMeasurements: new Map([
        [api.id, apiMeasurement],
        [database.id, { width: 204, height: 56 }],
      ]),
    };
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      measuredAddedState,
    );

    const undoneHistory = undoArchitectureEditorHistory(history);

    expect(undoneHistory.present.nodeMeasurements).toEqual(
      new Map([[api.id, apiMeasurement]]),
    );
    expect(undoneHistory.present.nodeMeasurements.get(api.id)).toBe(
      apiMeasurement,
    );
    expect(undoneHistory.present.nodeMeasurements).not.toBe(
      measuredAddedState.nodeMeasurements,
    );
  });

  it("retains the measurement reference when reconciliation removes nothing", () => {
    const state = initialState(api);
    const measuredState: ArchitectureEditorState = {
      ...state,
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
      ]),
    };
    const movedState: ArchitectureEditorState = {
      ...measuredState,
      nodePositions: moveDiagramNode(
        measuredState.nodePositions,
        api.id,
        { x: 120, y: 80 },
      ),
    };
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(measuredState),
      movedState,
    );

    const undoneHistory = undoArchitectureEditorHistory(history);

    expect(undoneHistory.present.nodeMeasurements).toBe(
      movedState.nodeMeasurements,
    );
  });

  it("trims the oldest past snapshots at the history limit", () => {
    const state = initialState(api);
    let history = createArchitectureEditorHistory(state);

    for (let index = 1; index <= ARCHITECTURE_EDITOR_HISTORY_LIMIT + 1; index += 1) {
      const nextState: ArchitectureEditorState = {
        ...history.present,
        nodePositions: moveDiagramNode(
          history.present.nodePositions,
          api.id,
          { x: index, y: 0 },
        ),
      };
      history = recordArchitectureEditorState(history, nextState);
    }

    expect(history.past).toHaveLength(ARCHITECTURE_EDITOR_HISTORY_LIMIT);
    expect(history.past[0]?.nodePositions.get(api.id)).toEqual({
      x: 1,
      y: 0,
    });
    expect(history.past.at(-1)?.nodePositions.get(api.id)).toEqual({
      x: ARCHITECTURE_EDITOR_HISTORY_LIMIT,
      y: 0,
    });
  });

  it("clears and reinitializes history while preserving current references", () => {
    const state = initialState(api);
    const nextState = expectEditorStateSuccess(
      addComponentToEditorState(state, database),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      nextState,
    );
    const clearedHistory = clearArchitectureEditorHistory(history);
    const reinitializedHistory = createArchitectureEditorHistory(
      clearedHistory.present,
    );

    expect(clearedHistory).toEqual({
      past: [],
      present: nextState,
      future: [],
    });
    expect(clearedHistory.present).toBe(nextState);
    expect(reinitializedHistory.present).toBe(nextState);
    expect(clearArchitectureEditorHistory(clearedHistory)).toBe(
      clearedHistory,
    );
  });

  it("does not mutate history inputs and preserves snapshot references", () => {
    const state = initialState(api);
    const initialHistory = createArchitectureEditorHistory(state);
    const pastBefore = [...initialHistory.past];
    const futureBefore = [...initialHistory.future];
    const nextState = expectEditorStateSuccess(
      addComponentToEditorState(state, database),
    );

    const recordedHistory = recordArchitectureEditorState(
      initialHistory,
      nextState,
    );

    expect(initialHistory.past).toEqual(pastBefore);
    expect(initialHistory.future).toEqual(futureBefore);
    expect(initialHistory.present).toBe(state);
    expect(recordedHistory.past[0]?.graph).toBe(state.graph);
    expect(recordedHistory.past[0]?.nodePositions).toBe(
      state.nodePositions,
    );
    expect(recordedHistory.present.graph).toBe(nextState.graph);
    expect(recordedHistory.present.nodePositions).toBe(
      nextState.nodePositions,
    );
  });
});
