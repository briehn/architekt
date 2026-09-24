import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  AUTO_LAYOUT_FAILURE_MESSAGE,
  AutoLayoutButton,
  canAutoLayoutFromEditorAction,
  getAutoLayoutAnnouncement,
  getNextAutoLayoutFitRequestId,
  recordAutoLayoutFromEditorAction,
} from "./architecture-editor";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  addComponentToEditorState,
  createArchitectureEditorState,
  createFreshArchitectureEditorState,
} from "./architecture-editor-state";

function component(
  id: string,
  name: string,
  kind: ArchitectureComponentKind = "service",
): ArchitectureComponent {
  return { id: id as ComponentId, name, kind };
}

function graphWithConnection(): ArchitectureGraph {
  const graph = graphWithComponents([
    component("api", "API", "gateway"),
    component("database", "Database", "database"),
  ]);
  const connection = graph.addConnection({
    id: "api-to-database" as ConnectionId,
    sourceComponentId: "api" as ComponentId,
    targetComponentId: "database" as ComponentId,
    kind: "data-access",
  });

  if (!connection.ok) {
    throw new Error("Test connection could not be created.");
  }

  return connection.graph;
}

function graphWithComponents(
  components: readonly ArchitectureComponent[],
): ArchitectureGraph {
  return components.reduce((graph, nextComponent) => {
    const result = graph.addComponent(nextComponent);
    if (!result.ok) {
      throw new Error("Test graph could not be created.");
    }

    return result.graph;
  }, ArchitectureGraph.empty());
}

function expectSuccessfulAutoLayout(
  history: ReturnType<typeof createArchitectureEditorHistory>,
) {
  const result = recordAutoLayoutFromEditorAction(history);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected auto-layout to succeed.");
  }

  return result;
}

describe("Auto-layout editor action", () => {
  it("renders a secondary native button with its accessible name", () => {
    const markup = renderToStaticMarkup(
      <AutoLayoutButton disabled={false} onAutoLayout={() => {}} />,
    );

    expect(markup).toContain('aria-label="Auto-layout"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Auto-layout");
    expect(markup).toContain("focus-visible:ring-2");
  });

  it("renders the button disabled when requested", () => {
    const markup = renderToStaticMarkup(
      <AutoLayoutButton disabled onAutoLayout={() => {}} />,
    );

    expect(markup).toContain("disabled=\"\"");
  });

  it("enables layout only for a non-empty graph without drag or inline rename", () => {
    const emptyState = createArchitectureEditorState(ArchitectureGraph.empty());
    const populatedState = createArchitectureEditorState(
      graphWithComponents([component("api", "API")]),
    );

    expect(canAutoLayoutFromEditorAction(emptyState, false, false)).toBe(false);
    expect(canAutoLayoutFromEditorAction(populatedState, true, false)).toBe(false);
    expect(canAutoLayoutFromEditorAction(populatedState, false, true)).toBe(false);
    expect(canAutoLayoutFromEditorAction(populatedState, false, false)).toBe(true);
  });

  it("does not require complete node measurements", () => {
    const graph = graphWithConnection();
    const state = {
      ...createArchitectureEditorState(graph),
      nodeMeasurements: new Map([
        ["api" as ComponentId, { width: 180, height: 72 }],
      ]),
    };

    expect(canAutoLayoutFromEditorAction(state, false, false)).toBe(true);
  });

  it("records one changed layout and preserves graph and measurements", () => {
    const graph = graphWithComponents([
      component("api", "API"),
      component("database", "Database"),
    ]);
    const measurements = new Map([
      ["api" as ComponentId, { width: 180, height: 72 }],
    ]);
    const state = {
      ...createArchitectureEditorState(graph),
      nodeMeasurements: measurements,
    };
    const history = createArchitectureEditorHistory(state);
    const result = expectSuccessfulAutoLayout(history);

    expect(result.changed).toBe(true);
    expect(result.history.past).toHaveLength(1);
    expect(result.history.present.graph).toBe(graph);
    expect(result.history.present.graph.getComponents()).toEqual(
      graph.getComponents(),
    );
    expect(result.history.present.graph.getConnections()).toEqual(
      graph.getConnections(),
    );
    expect(result.history.present.nodeMeasurements).toBe(measurements);
    expect(result.history.present.nodePositions).not.toBe(state.nodePositions);
  });

  it("undoes and redoes the complete layout position map", () => {
    const state = createArchitectureEditorState(
      graphWithComponents([
        component("api", "API"),
        component("database", "Database"),
      ]),
    );
    const history = createArchitectureEditorHistory(state);
    const result = expectSuccessfulAutoLayout(history);
    const undone = undoArchitectureEditorHistory(result.history);
    const redone = redoArchitectureEditorHistory(undone);

    expect(undone.present.nodePositions).toEqual(state.nodePositions);
    expect(redone.present.nodePositions).toEqual(
      result.history.present.nodePositions,
    );
    expect(redone.present.graph.getComponents()).toEqual(
      state.graph.getComponents(),
    );
  });

  it("preserves history and redo when the diagram is already arranged", () => {
    const graph = graphWithComponents([
      component("api", "API"),
      component("database", "Database"),
    ]);
    const initialState = createFreshArchitectureEditorState(graph);
    const added = addComponentToEditorState(
      initialState,
      component("cache", "Cache"),
    );
    if (!added.ok) return;
    const changedHistory = recordArchitectureEditorState(
      createArchitectureEditorHistory(initialState),
      added.state,
    );
    const historyWithRedo = undoArchitectureEditorHistory(changedHistory);
    const result = expectSuccessfulAutoLayout(historyWithRedo);

    expect(result.changed).toBe(false);
    expect(result.history).toBe(historyWithRedo);
    expect(result.history.future).toHaveLength(1);
  });

  it("clears redo when changed layout follows undo", () => {
    const initialState = createArchitectureEditorState(
      graphWithComponents([
        component("api", "API"),
        component("database", "Database"),
      ]),
    );
    const added = addComponentToEditorState(
      initialState,
      component("cache", "Cache"),
    );
    if (!added.ok) return;
    const historyWithChange = recordArchitectureEditorState(
      createArchitectureEditorHistory(initialState),
      added.state,
    );
    const historyWithRedo = undoArchitectureEditorHistory(historyWithChange);
    const result = expectSuccessfulAutoLayout(historyWithRedo);

    expect(result.changed).toBe(true);
    expect(result.history.future).toEqual([]);
  });


  it("requests a renderer fit only for each changed explicit layout", () => {
    expect(getNextAutoLayoutFitRequestId(0, true)).toBe(1);
    expect(getNextAutoLayoutFitRequestId(1, false)).toBe(1);
    expect(getNextAutoLayoutFitRequestId(1, true)).toBe(2);
  });

  it("uses the approved success and no-op status copy", () => {
    expect(getAutoLayoutAnnouncement(true)).toBe(
      "Diagram arranged. Undo is available.",
    );
    expect(getAutoLayoutAnnouncement(false)).toBe(
      "Diagram is already arranged.",
    );
    expect(AUTO_LAYOUT_FAILURE_MESSAGE).toBe(
      "Could not arrange the diagram. Try again.",
    );
  });
});
