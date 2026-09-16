import { describe, expect, it } from "vitest";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  addComponentToEditorState,
  addConnectionToEditorState,
  applyReactFlowNodeChangesToEditorState,
  changeComponentKindInEditorState,
  changeConnectionKindInEditorState,
  createArchitectureEditorState,
  type ArchitectureEditorState,
  renameComponentInEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
} from "./architecture-editor-state";
import {
  ARCHITECTURE_EDITOR_HISTORY_LIMIT,
  canRedoArchitectureEditorHistory,
  canUndoArchitectureEditorHistory,
  clearArchitectureEditorHistory,
  commitArchitectureEditorHistoryTransaction,
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

function component(
  id: string,
  name: string,
  kind: ArchitectureComponentKind = "service",
): ArchitectureComponent {
  return { id: componentId(id), name, kind };
}

function connection(
  id: string,
  sourceComponentId: ComponentId,
  targetComponentId: ComponentId,
  kind: ArchitectureConnectionKind = "generic",
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId,
    targetComponentId,
    kind,
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
const database = component("database", "Database", "database");
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

describe("structural editor-state history recording", () => {
  it("records one snapshot for an accepted component add", () => {
    const state = initialState(api);
    const nextState = expectEditorStateSuccess(
      addComponentToEditorState(state, database),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      nextState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.present).toBe(nextState);
    expect(history.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);

    const undoneHistory = undoArchitectureEditorHistory(history);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([api]);
    expect(redoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
  });

  it("records one snapshot for an accepted component delete", () => {
    const state = initialState(api, database);
    const nextState = expectEditorStateSuccess(
      removeComponentFromEditorState(state, database.id),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      nextState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.present.graph.getComponents()).toEqual([api]);
  });

  it("records one snapshot for an accepted component rename", () => {
    const state = initialState(api, database);
    const renamedState = expectEditorStateSuccess(
      renameComponentInEditorState(state, api.id, "Public API"),
    );

    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      renamedState,
    );

    expect(renamedState).not.toBe(state);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    expect(history.present).toBe(renamedState);
    expect(history.future).toEqual([]);
  });

  it("records, undoes, and redoes a kind change with ordinary graph snapshots", () => {
    const api = component("api", " API ", "service");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
    );
    const databaseToApi = connection(
      "database-to-api",
      database.id,
      api.id,
    );
    const state: ArchitectureEditorState = {
      ...initialState(api, database),
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
        [database.id, { width: 204, height: 56 }],
      ]),
    };
    const connectedState = expectEditorStateSuccess(
      addConnectionToEditorState(
        expectEditorStateSuccess(
          addConnectionToEditorState(state, apiToDatabase),
        ),
        databaseToApi,
      ),
    );
    const changedState = expectEditorStateSuccess(
      changeComponentKindInEditorState(
        connectedState,
        api.id,
        "gateway",
      ),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(connectedState),
      changedState,
    );

    expect(changedState).not.toBe(connectedState);
    expect(history.past).toEqual([
      {
        graph: connectedState.graph,
        nodePositions: connectedState.nodePositions,
      },
    ]);
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    expect(history.present).toBe(changedState);
    expect(history.future).toEqual([]);

    const undoneHistory = undoArchitectureEditorHistory(history);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(undoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
    expect(undoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(undoneHistory.present.nodeMeasurements).toBe(
      changedState.nodeMeasurements,
    );
    expect(redoneHistory.present.graph.getComponents()).toEqual([
      { id: api.id, name: " API ", kind: "gateway" },
      database,
    ]);
    expect(redoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
    expect(redoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(redoneHistory.present.nodeMeasurements).toBe(
      changedState.nodeMeasurements,
    );
  });

  it("records, undoes, and redoes a connection kind change with ordinary graph snapshots", () => {
    const api = component("api", "API", "service");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "generic",
    );
    const databaseToApi = connection(
      "database-to-api",
      database.id,
      api.id,
      "streaming",
    );
    const state: ArchitectureEditorState = {
      ...initialState(api, database),
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
        [database.id, { width: 204, height: 56 }],
      ]),
    };
    const connectedState = expectEditorStateSuccess(
      addConnectionToEditorState(
        expectEditorStateSuccess(
          addConnectionToEditorState(state, apiToDatabase),
        ),
        databaseToApi,
      ),
    );
    const changedState = expectEditorStateSuccess(
      changeConnectionKindInEditorState(
        connectedState,
        apiToDatabase.id,
        "request-response",
      ),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(connectedState),
      changedState,
    );

    expect(changedState).not.toBe(connectedState);
    expect(history.past).toEqual([
      {
        graph: connectedState.graph,
        nodePositions: connectedState.nodePositions,
      },
    ]);
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    expect(history.present).toBe(changedState);
    expect(history.future).toEqual([]);

    const undoneHistory = undoArchitectureEditorHistory(history);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(undoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
      databaseToApi,
    ]);
    expect(undoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(undoneHistory.present.nodeMeasurements).toBe(
      changedState.nodeMeasurements,
    );
    expect(redoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(redoneHistory.present.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "request-response" },
      databaseToApi,
    ]);
    expect(redoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(redoneHistory.present.nodeMeasurements).toBe(
      changedState.nodeMeasurements,
    );
  });

  it("records one snapshot for an accepted connection add", () => {
    const state = initialState(api, database);
    const nextState = expectEditorStateSuccess(
      addConnectionToEditorState(state, apiToDatabase),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      nextState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.present.graph.getConnections()).toEqual([apiToDatabase]);
  });

  it("records one snapshot for an accepted connection delete", () => {
    const state = expectEditorStateSuccess(
      addConnectionToEditorState(initialState(api, database), apiToDatabase),
    );
    const nextState = expectEditorStateSuccess(
      removeConnectionFromEditorState(state, apiToDatabase.id),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      nextState,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.present.graph.getConnections()).toEqual([]);
  });

  it("preserves both history stacks after rejected structural operations", () => {
    const initialHistory = createArchitectureEditorHistory(initialState(api));
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        initialHistory,
        expectEditorStateSuccess(
          addComponentToEditorState(initialHistory.present, database),
        ),
      ),
    );
    const rejectedComponent = addComponentToEditorState(
      historyWithFuture.present,
      api,
    );
    const rejectedConnection = addConnectionToEditorState(
      historyWithFuture.present,
      apiToDatabase,
    );
    const pastBeforeRejectedOperations = historyWithFuture.past;
    const futureBeforeRejectedOperations = historyWithFuture.future;

    expect(rejectedComponent.ok).toBe(false);
    expect(rejectedConnection.ok).toBe(false);
    expect(
      recordArchitectureEditorState(
        historyWithFuture,
        historyWithFuture.present,
      ),
    ).toBe(historyWithFuture);
    expect(historyWithFuture.past).toBe(pastBeforeRejectedOperations);
    expect(historyWithFuture.future).toBe(futureBeforeRejectedOperations);
  });

  it("leaves history untouched after rejected component renames", () => {
    const history = createArchitectureEditorHistory(initialState(api));
    const pastBefore = history.past;
    const futureBefore = history.future;
    const blankNameResult = renameComponentInEditorState(
      history.present,
      api.id,
      " ",
    );
    const unknownIdResult = renameComponentInEditorState(
      history.present,
      componentId("missing"),
      "Missing",
    );

    expect(blankNameResult).toEqual({
      ok: false,
      error: { type: "component-name-empty", componentId: api.id },
    });
    expect(unknownIdResult).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: componentId("missing"),
      },
    });
    expect(history.past).toBe(pastBefore);
    expect(history.present.graph.getComponents()).toEqual([api]);
    expect(history.future).toBe(futureBefore);
  });

  it("keeps measurement and position changes non-recording", () => {
    const state = initialState(api);
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        expectEditorStateSuccess(addComponentToEditorState(state, database)),
      ),
    );
    const measuredState = applyReactFlowNodeChangesToEditorState(
      historyWithFuture.present,
      [
        {
          id: api.id,
          type: "dimensions",
          dimensions: { width: 176, height: 48 },
        },
      ],
    );
    const measuredHistory = replaceArchitectureEditorStateWithoutHistory(
      historyWithFuture,
      measuredState,
    );
    const movedState = applyReactFlowNodeChangesToEditorState(
      measuredHistory.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: true,
        },
      ],
    );
    const movedHistory = replaceArchitectureEditorStateWithoutHistory(
      measuredHistory,
      movedState,
    );

    expect(measuredHistory.past).toBe(historyWithFuture.past);
    expect(measuredHistory.future).toBe(historyWithFuture.future);
    expect(movedHistory.past).toBe(historyWithFuture.past);
    expect(movedHistory.future).toBe(historyWithFuture.future);
    expect(canRedoArchitectureEditorHistory(movedHistory)).toBe(true);
  });

  it("clears redo after a new accepted structural edit", () => {
    const state = initialState(api);
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        expectEditorStateSuccess(addComponentToEditorState(state, database)),
      ),
    );
    const cache = component("cache", "Cache");
    const nextState = expectEditorStateSuccess(
      addComponentToEditorState(historyWithFuture.present, cache),
    );
    const history = recordArchitectureEditorState(historyWithFuture, nextState);

    expect(history.past).toHaveLength(1);
    expect(history.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(history)).toBe(false);
  });

  it("clears redo after a changed rename but preserves it after an exact no-op", () => {
    const initialHistory = createArchitectureEditorHistory(initialState(api));
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        initialHistory,
        expectEditorStateSuccess(
          addComponentToEditorState(initialHistory.present, database),
        ),
      ),
    );
    const noOpRename = expectEditorStateSuccess(
      renameComponentInEditorState(historyWithFuture.present, api.id, api.name),
    );
    const historyAfterNoOp = recordArchitectureEditorState(
      historyWithFuture,
      noOpRename,
    );
    const renamedState = expectEditorStateSuccess(
      renameComponentInEditorState(
        historyAfterNoOp.present,
        api.id,
        "Public API",
      ),
    );
    const historyAfterRename = recordArchitectureEditorState(
      historyAfterNoOp,
      renamedState,
    );

    expect(noOpRename).toBe(historyWithFuture.present);
    expect(historyAfterNoOp).toBe(historyWithFuture);
    expect(canRedoArchitectureEditorHistory(historyAfterNoOp)).toBe(true);
    expect(historyAfterRename.past).toHaveLength(1);
    expect(historyAfterRename.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(historyAfterRename)).toBe(false);
  });

  it("preserves redo for a same-kind no-op and clears it for a changed kind", () => {
    const initialHistory = createArchitectureEditorHistory(initialState(api));
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        initialHistory,
        expectEditorStateSuccess(
          addComponentToEditorState(initialHistory.present, database),
        ),
      ),
    );
    const pastBeforeNoOp = historyWithFuture.past;
    const futureBeforeNoOp = historyWithFuture.future;
    const noOpState = expectEditorStateSuccess(
      changeComponentKindInEditorState(
        historyWithFuture.present,
        api.id,
        api.kind,
      ),
    );
    const historyAfterNoOp = recordArchitectureEditorState(
      historyWithFuture,
      noOpState,
    );
    const rejectedChange = changeComponentKindInEditorState(
      historyAfterNoOp.present,
      componentId("missing"),
      "gateway",
    );
    const changedState = expectEditorStateSuccess(
      changeComponentKindInEditorState(
        historyAfterNoOp.present,
        api.id,
        "gateway",
      ),
    );
    const historyAfterChangedKind = recordArchitectureEditorState(
      historyAfterNoOp,
      changedState,
    );

    expect(noOpState).toBe(historyWithFuture.present);
    expect(historyAfterNoOp).toBe(historyWithFuture);
    expect(historyAfterNoOp.past).toBe(pastBeforeNoOp);
    expect(historyAfterNoOp.future).toBe(futureBeforeNoOp);
    expect(canRedoArchitectureEditorHistory(historyAfterNoOp)).toBe(true);
    expect(rejectedChange).toEqual({
      ok: false,
      error: {
        type: "component-id-does-not-exist",
        componentId: componentId("missing"),
      },
    });
    expect(historyAfterNoOp.present).toBe(historyWithFuture.present);
    expect(historyAfterNoOp.past).toBe(pastBeforeNoOp);
    expect(historyAfterNoOp.future).toBe(futureBeforeNoOp);
    expect(historyAfterChangedKind.past).toHaveLength(1);
    expect(historyAfterChangedKind.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(historyAfterChangedKind)).toBe(false);
  });

  it("preserves redo for a same-kind connection update, rejects unknown IDs, and clears redo for a changed kind", () => {
    const api = component("api", "API");
    const database = component("database", "Database", "database");
    const apiToDatabase = connection(
      "api-to-database",
      api.id,
      database.id,
      "generic",
    );
    const connectedState = expectEditorStateSuccess(
      addConnectionToEditorState(
        initialState(api, database),
        apiToDatabase,
      ),
    );
    const changedHistory = recordArchitectureEditorState(
      createArchitectureEditorHistory(connectedState),
      expectEditorStateSuccess(
        changeConnectionKindInEditorState(
          connectedState,
          apiToDatabase.id,
          "async-messaging",
        ),
      ),
    );
    const historyWithFuture = undoArchitectureEditorHistory(changedHistory);
    const pastBeforeNoOp = historyWithFuture.past;
    const futureBeforeNoOp = historyWithFuture.future;
    const noOpState = expectEditorStateSuccess(
      changeConnectionKindInEditorState(
        historyWithFuture.present,
        apiToDatabase.id,
        apiToDatabase.kind,
      ),
    );
    const historyAfterNoOp = recordArchitectureEditorState(
      historyWithFuture,
      noOpState,
    );
    const rejectedChange = changeConnectionKindInEditorState(
      historyAfterNoOp.present,
      connectionId("missing"),
      "data-access",
    );
    const changedState = expectEditorStateSuccess(
      changeConnectionKindInEditorState(
        historyAfterNoOp.present,
        apiToDatabase.id,
        "data-access",
      ),
    );
    const historyAfterChangedKind = recordArchitectureEditorState(
      historyAfterNoOp,
      changedState,
    );

    expect(noOpState).toBe(historyWithFuture.present);
    expect(historyAfterNoOp).toBe(historyWithFuture);
    expect(historyAfterNoOp.past).toBe(pastBeforeNoOp);
    expect(historyAfterNoOp.future).toBe(futureBeforeNoOp);
    expect(canRedoArchitectureEditorHistory(historyAfterNoOp)).toBe(true);
    expect(rejectedChange).toEqual({
      ok: false,
      error: {
        type: "connection-id-does-not-exist",
        connectionId: connectionId("missing"),
      },
    });
    expect(historyAfterNoOp.present).toBe(historyWithFuture.present);
    expect(historyAfterNoOp.past).toBe(pastBeforeNoOp);
    expect(historyAfterNoOp.future).toBe(futureBeforeNoOp);
    expect(historyAfterChangedKind.past).toHaveLength(1);
    expect(historyAfterChangedKind.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(historyAfterChangedKind)).toBe(false);
  });

  it("undoes and redoes a rename while preserving graph structure and eligible measurements", () => {
    const state: ArchitectureEditorState = {
      ...initialState(api, database),
      nodeMeasurements: new Map([
        [api.id, { width: 176, height: 48 }],
        [database.id, { width: 204, height: 56 }],
      ]),
    };
    const connectedState = expectEditorStateSuccess(
      addConnectionToEditorState(state, apiToDatabase),
    );
    const renamedState = expectEditorStateSuccess(
      renameComponentInEditorState(
        connectedState,
        api.id,
        "Public API",
      ),
    );
    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(connectedState),
      renamedState,
    );

    const undoneHistory = undoArchitectureEditorHistory(history);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(undoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
    ]);
    expect(undoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(undoneHistory.present.nodeMeasurements).toBe(
      renamedState.nodeMeasurements,
    );
    expect(redoneHistory.present.graph.getComponents()).toEqual([
      { id: api.id, name: "Public API", kind: api.kind },
      database,
    ]);
    expect(redoneHistory.present.graph.getConnections()).toEqual([
      apiToDatabase,
    ]);
    expect(redoneHistory.present.nodePositions).toBe(
      connectedState.nodePositions,
    );
    expect(redoneHistory.present.nodeMeasurements).toBe(
      renamedState.nodeMeasurements,
    );
  });
});

describe("ArchitectureEditorHistory drag transactions", () => {
  it("commits multiple intermediate replacements as one final entry", () => {
    const state = initialState(api);
    const transactionStart = createArchitectureEditorHistory(state);
    const firstFrameState = applyReactFlowNodeChangesToEditorState(
      transactionStart.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 40, y: 20 },
          dragging: true,
        },
      ],
    );
    const firstFrameHistory = replaceArchitectureEditorStateWithoutHistory(
      transactionStart,
      firstFrameState,
    );
    const finalState = applyReactFlowNodeChangesToEditorState(
      firstFrameHistory.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: false,
        },
        {
          id: api.id,
          type: "dimensions",
          dimensions: { width: 176, height: 48 },
        },
      ],
    );
    const finalFrameHistory = replaceArchitectureEditorStateWithoutHistory(
      firstFrameHistory,
      finalState,
    );

    const history = commitArchitectureEditorHistoryTransaction(
      transactionStart,
      finalFrameHistory,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]).toEqual({
      graph: state.graph,
      nodePositions: state.nodePositions,
    });
    expect(history.past[0]).not.toHaveProperty("nodeMeasurements");
    expect(history.present).toBe(finalState);
    expect(history.present.nodePositions.get(api.id)).toEqual({
      x: 120,
      y: 80,
    });
    expect(history.present.nodeMeasurements.get(api.id)).toEqual({
      width: 176,
      height: 48,
    });
    expect(undoArchitectureEditorHistory(history).present.nodePositions).toBe(
      state.nodePositions,
    );
  });

  it("treats returning to the pre-drag coordinates as a no-op", () => {
    const state = initialState(api);
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        expectEditorStateSuccess(addComponentToEditorState(state, database)),
      ),
    );
    const movedState = applyReactFlowNodeChangesToEditorState(
      historyWithFuture.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: true,
        },
      ],
    );
    const movedHistory = replaceArchitectureEditorStateWithoutHistory(
      historyWithFuture,
      movedState,
    );
    const returnedState = applyReactFlowNodeChangesToEditorState(
      movedHistory.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 0, y: 0 },
          dragging: false,
        },
      ],
    );
    const returnedHistory = replaceArchitectureEditorStateWithoutHistory(
      movedHistory,
      returnedState,
    );

    const history = commitArchitectureEditorHistoryTransaction(
      historyWithFuture,
      returnedHistory,
    );

    expect(history).toBe(returnedHistory);
    expect(history.past).toBe(historyWithFuture.past);
    expect(history.future).toBe(historyWithFuture.future);
    expect(canUndoArchitectureEditorHistory(history)).toBe(false);
    expect(canRedoArchitectureEditorHistory(history)).toBe(true);
  });

  it("clears redo only when the completed drag changes position", () => {
    const state = initialState(api);
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(state),
        expectEditorStateSuccess(addComponentToEditorState(state, database)),
      ),
    );
    const finalState = applyReactFlowNodeChangesToEditorState(
      historyWithFuture.present,
      [
        {
          id: api.id,
          type: "position",
          position: { x: 120, y: 80 },
          dragging: false,
        },
      ],
    );
    const finalFrameHistory = replaceArchitectureEditorStateWithoutHistory(
      historyWithFuture,
      finalState,
    );

    const history = commitArchitectureEditorHistoryTransaction(
      historyWithFuture,
      finalFrameHistory,
    );

    expect(history.past).toHaveLength(1);
    expect(history.past[0]?.nodePositions).toBe(
      historyWithFuture.present.nodePositions,
    );
    expect(history.present).toBe(finalState);
    expect(history.future).toEqual([]);
    expect(canRedoArchitectureEditorHistory(history)).toBe(false);
  });

  it("ignores a stale transaction without changing current history", () => {
    const state = initialState(api);
    const transactionStart = createArchitectureEditorHistory(state);
    const structurallyEditedHistory = recordArchitectureEditorState(
      transactionStart,
      expectEditorStateSuccess(addComponentToEditorState(state, database)),
    );

    const history = commitArchitectureEditorHistoryTransaction(
      transactionStart,
      structurallyEditedHistory,
    );

    expect(history).toBe(structurallyEditedHistory);
    expect(transactionStart.past).toEqual([]);
    expect(transactionStart.present).toBe(state);
    expect(structurallyEditedHistory.past).toHaveLength(1);
  });
});
