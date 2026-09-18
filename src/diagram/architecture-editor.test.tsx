import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import {
  ARCHITECTURE_CONNECTION_KINDS,
} from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import {
  ArchitectureEditor,
  clearComponentCreationDraftName,
  ComponentKindSelect,
  ComponentListKindSelect,
  ConnectionListKindSelect,
  createArchitectureComponentFromCreationDraft,
  createExampleArchitectureEditorState,
  createFreshExampleArchitectureEditorHistory,
  createComponentCreationDraft,
  createRenameDraft,
  createRenameSession,
  getArchitectureComponentKindFromSelectValue,
  getArchitectureConnectionKindFromSelectValue,
  getComponentListKindSelectAccessibleName,
  getConnectionListKindSelectAccessibleName,
  recordComponentKindChangeFromList,
  recordConnectionKindChangeFromList,
  getRenameDraftValidationMessage,
  updateComponentCreationDraftKind,
  updateComponentCreationDraftName,
  updateRenameDraftName,
} from "./architecture-editor";
import {
  addComponentToEditorState,
  createArchitectureEditorState,
} from "./architecture-editor-state";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import { getComponentKindPresentation } from "./component-kind-presentation";
import { getConnectionKindPresentation } from "./connection-kind-presentation";
import {
  toArchitectureConnection,
  toReactFlowDiagram,
} from "./react-flow-adapter";
import { withArchitectureEdgePresentation } from "./static-diagram";
import type { ComponentId, ConnectionId } from "../domain/identifiers";

describe("ArchitectureEditor", () => {
  it("server-renders only the stable loading shell", () => {
    const markup = renderToStaticMarkup(<ArchitectureEditor />);

    expect(markup).toContain("Loading saved workspace…");
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("Component name");
    expect(markup).not.toContain("architekt-diagram");
    expect(markup).not.toContain("react-flow");
  });

  it("seeds API to Database as data access without changing the fresh example topology", () => {
    const exampleState = createExampleArchitectureEditorState();
    const repeatedExampleState = createExampleArchitectureEditorState();
    const freshHistory = createFreshExampleArchitectureEditorHistory();

    expect(exampleState.graph.getComponents()).toEqual([
      { id: "api" as ComponentId, name: "API", kind: "service" },
      {
        id: "database" as ComponentId,
        name: "Database",
        kind: "database",
      },
    ]);
    expect(exampleState.graph.getConnections()).toEqual([
      {
        id: "api-to-database" as ConnectionId,
        sourceComponentId: "api" as ComponentId,
        targetComponentId: "database" as ComponentId,
        kind: "data-access",
      },
    ]);
    expect(repeatedExampleState.graph).toBe(exampleState.graph);
    expect(repeatedExampleState.nodePositions).toEqual(
      exampleState.nodePositions,
    );
    expect(exampleState.nodePositions).toEqual(
      new Map([
        ["api" as ComponentId, { x: 32, y: 32 }],
        ["database" as ComponentId, { x: 368, y: 32 }],
      ]),
    );
    expect(exampleState.nodeMeasurements).toEqual(new Map());
    expect(freshHistory.past).toEqual([]);
    expect(freshHistory.future).toEqual([]);
    expect(freshHistory.present.nodePositions).toEqual(
      exampleState.nodePositions,
    );

    const diagram = toReactFlowDiagram(
      exampleState.graph,
      exampleState.nodePositions,
    );
    const edge = diagram.edges[0];
    const presentedEdge = withArchitectureEdgePresentation(
      diagram.edges,
      diagram.nodes,
    )[0];

    expect(edge).toMatchObject({
      id: "api-to-database",
      source: "api",
      target: "database",
      data: { kind: "data-access" },
    });
    expect(presentedEdge).toMatchObject({
      label: "Data access",
      ariaLabel: "API to Database, Data access",
    });
    expect(
      toArchitectureConnection(
        {
          source: "api",
          target: "database",
          sourceHandle: null,
          targetHandle: null,
        },
        "new-connection" as ConnectionId,
      ),
    ).toMatchObject({ kind: "generic" });
  });

  it("starts a fresh draft when switching rename targets", () => {
    const apiId = "api" as ComponentId;
    const databaseId = "database" as ComponentId;
    const apiDraft = updateRenameDraftName(
      createRenameDraft(apiId, "API"),
      "Uncommitted API",
    );
    const databaseDraft = createRenameDraft(databaseId, "Database");

    expect(apiDraft).toEqual({
      componentId: apiId,
      name: "Uncommitted API",
      validationMessage: null,
    });
    expect(databaseDraft).toEqual({
      componentId: databaseId,
      name: "Database",
      validationMessage: null,
    });
  });

  it("keeps the rename origin with the single active rename session", () => {
    const apiId = "api" as ComponentId;
    const databaseId = "database" as ComponentId;
    const listSession = createRenameSession(apiId, "API", "list");
    const canvasSession = createRenameSession(databaseId, "Database", "canvas");

    expect(listSession).toEqual({
      draft: createRenameDraft(apiId, "API"),
      origin: "list",
    });
    expect(canvasSession).toEqual({
      draft: createRenameDraft(databaseId, "Database"),
      origin: "canvas",
    });
  });

  it("keeps raw rename input while validating whitespace with trim", () => {
    const apiId = "api" as ComponentId;
    const draft = createRenameDraft(apiId, "  Public API  ");
    const blankDraft = updateRenameDraftName(draft, " \t ");

    expect(draft.name).toBe("  Public API  ");
    expect(getRenameDraftValidationMessage(draft)).toBeNull();
    expect(getRenameDraftValidationMessage(blankDraft)).toBe(
      "Enter a component name.",
    );
  });

  it("renders a native component type select with every presentation label", () => {
    const markup = renderToStaticMarkup(
      <ComponentKindSelect onKindChange={() => {}} value="service" />,
    );

    expect(markup).toContain('id="component-kind"');
    expect(markup).toContain("Component type");
    expect(markup).toContain('<option value="service" selected="">Service</option>');

    for (const kind of ARCHITECTURE_COMPONENT_KINDS) {
      expect(markup).toContain(`value="${kind}"`);
      expect(markup).toContain(`>${getComponentKindPresentation(kind).label}</option>`);
    }
  });

  it("keeps a typed component-kind draft and rejects impossible DOM values", () => {
    const initialDraft = createComponentCreationDraft();
    const databaseDraft = updateComponentCreationDraftKind(
      initialDraft,
      "database",
    );

    expect(initialDraft).toEqual({ name: "", kind: "service" });
    expect(databaseDraft).toEqual({ name: "", kind: "database" });

    for (const invalidKind of ["redis", "", 123, null]) {
      expect(
        updateComponentCreationDraftKind(databaseDraft, invalidKind),
      ).toBe(databaseDraft);
    }
  });

  it("renders each component row type control with its canonical kind and an accessible name", () => {
    const markup = renderToStaticMarkup(
      <ComponentListKindSelect
        accessibleName="Change type for Payments API"
        onKindChange={() => {}}
        value="gateway"
      />,
    );

    expect(markup).toContain('aria-label="Change type for Payments API"');
    expect(markup).toContain(
      '<option value="gateway" selected="">Gateway</option>',
    );

    for (const kind of ARCHITECTURE_COMPONENT_KINDS) {
      expect(markup).toContain(`value="${kind}"`);
      expect(markup).toContain(
        `>${getComponentKindPresentation(kind).label}</option>`,
      );
    }
  });

  it("uses the existing conditional ID disambiguation for duplicate component names", () => {
    const component = { id: "payments-api" as ComponentId, name: "API" };

    expect(
      getComponentListKindSelectAccessibleName(component, false),
    ).toBe("Change type for API");
    expect(
      getComponentListKindSelectAccessibleName(component, true),
    ).toBe("Change type for API (payments-api)");
  });

  it("narrows a raw list-select value before it reaches the typed editor-state operation", () => {
    expect(getArchitectureComponentKindFromSelectValue("cache")).toBe("cache");

    for (const invalidKind of ["redis", "", 123, null]) {
      expect(getArchitectureComponentKindFromSelectValue(invalidKind)).toBeNull();
    }
  });

  it("renders each connection row type control with its canonical kind and every presentation label", () => {
    const markup = renderToStaticMarkup(
      <ConnectionListKindSelect
        accessibleName="Change connection type from Payments API to Users DB"
        onKindChange={() => {}}
        value="request-response"
      />,
    );

    expect(markup).toContain(
      'aria-label="Change connection type from Payments API to Users DB"',
    );
    expect(markup).toContain(
      '<option value="request-response" selected="">Request/response</option>',
    );

    for (const kind of ARCHITECTURE_CONNECTION_KINDS) {
      expect(markup).toContain(`value="${kind}"`);
      expect(markup).toContain(
        `>${getConnectionKindPresentation(kind).accessibleLabel}</option>`,
      );
    }
  });

  it("conditionally disambiguates duplicate visible connection endpoints in the select name", () => {
    const connection = {
      sourceComponentId: "api-one" as ComponentId,
      targetComponentId: "database-one" as ComponentId,
    };

    expect(
      getConnectionListKindSelectAccessibleName(
        connection,
        "API",
        "Database",
        false,
      ),
    ).toBe("Change connection type from API to Database");
    expect(
      getConnectionListKindSelectAccessibleName(
        connection,
        "API",
        "Database",
        true,
      ),
    ).toBe(
      "Change connection type from API (api-one) to Database (database-one)",
    );
  });

  it("narrows raw connection-list values before they reach the typed editor-state operation", () => {
    expect(getArchitectureConnectionKindFromSelectValue("streaming")).toBe(
      "streaming",
    );

    for (const invalidKind of ["websocket", "", 123, null]) {
      expect(getArchitectureConnectionKindFromSelectValue(invalidKind)).toBeNull();
    }
  });

  it("records a real list kind change while preserving canonical graph and layout data", () => {
    const api = {
      id: "api" as ComponentId,
      name: "Payments API",
      kind: "service" as const,
    };
    const database = {
      id: "database" as ComponentId,
      name: "Users DB",
      kind: "database" as const,
    };
    const graphWithApi = ArchitectureGraph.empty().addComponent(api);
    expect(graphWithApi.ok).toBe(true);
    if (!graphWithApi.ok) return;

    const graph = graphWithApi.graph.addComponent(database);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const connectedGraph = graph.graph.addConnection({
      id: "api-to-database" as ConnectionId,
      sourceComponentId: api.id,
      targetComponentId: database.id,
      kind: "generic",
    });
    expect(connectedGraph.ok).toBe(true);
    if (!connectedGraph.ok) return;

    const initialState = createArchitectureEditorState(connectedGraph.graph);
    const history = recordComponentKindChangeFromList(
      createArchitectureEditorHistory(initialState),
      api.id,
      "gateway",
    );
    const undone = undoArchitectureEditorHistory(history);
    const redone = redoArchitectureEditorHistory(undone);

    expect(history.past).toHaveLength(1);
    expect(history.present.nodePositions).toBe(initialState.nodePositions);
    expect(history.present.graph.getComponents()).toEqual([
      { ...api, kind: "gateway" },
      database,
    ]);
    expect(history.present.graph.getConnections()).toEqual(
      initialState.graph.getConnections(),
    );
    expect(undone.present.graph.getComponents()[0]).toEqual(api);
    expect(redone.present.graph.getComponents()[0]).toEqual({
      ...api,
      kind: "gateway",
    });
    expect(redone.present.nodePositions).toEqual(initialState.nodePositions);

    const noOpAfterUndo = recordComponentKindChangeFromList(
      undone,
      api.id,
      "service",
    );
    const rejected = recordComponentKindChangeFromList(
      undone,
      "missing" as ComponentId,
      "cache",
    );
    const changedAfterUndo = recordComponentKindChangeFromList(
      undone,
      api.id,
      "cache",
    );

    expect(noOpAfterUndo).toBe(undone);
    expect(rejected).toBe(undone);
    expect(changedAfterUndo.future).toEqual([]);
    expect(changedAfterUndo.present.graph.getComponents()[0]).toEqual({
      ...api,
      kind: "cache",
    });
  });

  it("records connection-list kind changes through generic history without changing topology or layout", () => {
    const api = {
      id: "api" as ComponentId,
      name: "Payments API",
      kind: "service" as const,
    };
    const database = {
      id: "database" as ComponentId,
      name: "Users DB",
      kind: "database" as const,
    };
    const apiToDatabase = {
      id: "api-to-database" as ConnectionId,
      sourceComponentId: api.id,
      targetComponentId: database.id,
      kind: "generic" as const,
    };
    const databaseToApi = {
      id: "database-to-api" as ConnectionId,
      sourceComponentId: database.id,
      targetComponentId: api.id,
      kind: "streaming" as const,
    };
    const graphWithApi = ArchitectureGraph.empty().addComponent(api);
    expect(graphWithApi.ok).toBe(true);
    if (!graphWithApi.ok) return;

    const graphWithDatabase = graphWithApi.graph.addComponent(database);
    expect(graphWithDatabase.ok).toBe(true);
    if (!graphWithDatabase.ok) return;

    const graphWithForwardConnection = graphWithDatabase.graph.addConnection(
      apiToDatabase,
    );
    expect(graphWithForwardConnection.ok).toBe(true);
    if (!graphWithForwardConnection.ok) return;

    const graph = graphWithForwardConnection.graph.addConnection(databaseToApi);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;

    const createdState = createArchitectureEditorState(graph.graph);
    const initialState = {
      ...createdState,
      nodeMeasurements: new Map([[api.id, { width: 220, height: 84 }]]),
    };
    const initialHistory = createArchitectureEditorHistory(initialState);
    const requestResponseHistory = recordConnectionKindChangeFromList(
      initialHistory,
      apiToDatabase.id,
      "request-response",
    );
    const asyncMessagingHistory = recordConnectionKindChangeFromList(
      requestResponseHistory,
      apiToDatabase.id,
      "async-messaging",
    );
    const undoneHistory = undoArchitectureEditorHistory(asyncMessagingHistory);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(requestResponseHistory.past).toHaveLength(1);
    expect(asyncMessagingHistory.past).toHaveLength(2);
    expect(asyncMessagingHistory.present.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "async-messaging" },
      databaseToApi,
    ]);
    expect(asyncMessagingHistory.present.graph.getComponents()).toEqual([
      api,
      database,
    ]);
    expect(asyncMessagingHistory.present.nodePositions).toBe(
      initialState.nodePositions,
    );
    expect(asyncMessagingHistory.present.nodeMeasurements).toBe(
      initialState.nodeMeasurements,
    );
    expect(undoneHistory.present.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "request-response" },
      databaseToApi,
    ]);
    expect(redoneHistory.present.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "async-messaging" },
      databaseToApi,
    ]);

    const noOpAfterUndo = recordConnectionKindChangeFromList(
      undoneHistory,
      apiToDatabase.id,
      "request-response",
    );
    const rejected = recordConnectionKindChangeFromList(
      undoneHistory,
      "missing" as ConnectionId,
      "data-access",
    );
    const changedAfterUndo = recordConnectionKindChangeFromList(
      undoneHistory,
      apiToDatabase.id,
      "data-access",
    );

    expect(noOpAfterUndo).toBe(undoneHistory);
    expect(rejected).toBe(undoneHistory);
    expect(changedAfterUndo.future).toEqual([]);
    expect(changedAfterUndo.present.graph.getConnections()).toEqual([
      { ...apiToDatabase, kind: "data-access" },
      databaseToApi,
    ]);

    const genericHistory = recordConnectionKindChangeFromList(
      requestResponseHistory,
      apiToDatabase.id,
      "generic",
    );
    const genericDiagram = toReactFlowDiagram(
      genericHistory.present.graph,
      genericHistory.present.nodePositions,
    );
    const genericEdge = withArchitectureEdgePresentation(
      genericDiagram.edges,
      genericDiagram.nodes,
    ).find((edge) => edge.id === apiToDatabase.id);

    expect(genericEdge).toMatchObject({
      data: { kind: "generic" },
      label: undefined,
      ariaLabel: "Payments API to Users DB, Generic",
    });
  });

  it.each(ARCHITECTURE_CONNECTION_KINDS)(
    "allows %s to be selected through the connection-list history bridge",
    (kind) => {
      const api = {
        id: "api" as ComponentId,
        name: "API",
        kind: "service" as const,
      };
      const database = {
        id: "database" as ComponentId,
        name: "Database",
        kind: "database" as const,
      };
      const withApi = ArchitectureGraph.empty().addComponent(api);
      if (!withApi.ok) return;
      const withDatabase = withApi.graph.addComponent(database);
      if (!withDatabase.ok) return;
      const withConnection = withDatabase.graph.addConnection({
        id: "api-to-database" as ConnectionId,
        sourceComponentId: api.id,
        targetComponentId: database.id,
        kind: "generic",
      });
      if (!withConnection.ok) return;

      const history = recordConnectionKindChangeFromList(
        createArchitectureEditorHistory(
        createArchitectureEditorState(withConnection.graph),
        ),
        "api-to-database" as ConnectionId,
        kind,
      );

      expect(history.present.graph.getConnections()[0]?.kind).toBe(kind);
    },
  );

  it("creates the selected kind canonically and retains it after a successful creation", () => {
    const draft = updateComponentCreationDraftKind(
      updateComponentCreationDraftName(createComponentCreationDraft(), " API "),
      "database",
    );
    const component = createArchitectureComponentFromCreationDraft(
      "api" as ComponentId,
      draft,
    );
    const initialState = createArchitectureEditorState(ArchitectureGraph.empty());
    const addedResult = addComponentToEditorState(initialState, component);

    expect(component).toEqual({
      id: "api" as ComponentId,
      name: "API",
      kind: "database" as ArchitectureComponentKind,
    });
    expect(addedResult.ok).toBe(true);

    if (!addedResult.ok) {
      return;
    }

    expect(clearComponentCreationDraftName(draft)).toEqual({
      name: "",
      kind: "database",
    });
    expect(
      updateComponentCreationDraftName(draft, " ").kind,
    ).toBe("database");
    expect(addedResult.state.graph.getComponents()).toEqual([component]);

    const history = recordArchitectureEditorState(
      createArchitectureEditorHistory(initialState),
      addedResult.state,
    );
    const undoneHistory = undoArchitectureEditorHistory(history);
    const redoneHistory = redoArchitectureEditorHistory(undoneHistory);

    expect(undoneHistory.present.graph.getComponents()).toEqual([]);
    expect(redoneHistory.present.graph.getComponents()).toEqual([component]);
  });
});
