import { describe, expect, it, vi } from "vitest";

vi.mock("./auto-layout", () => ({
  layoutArchitectureGraph: () => ({
    ok: false,
    error: { type: "layout-failed" },
  }),
}));

import type { ArchitectureComponent } from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import { recordAutoLayoutFromEditorAction } from "./architecture-editor";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  addComponentToEditorState,
  createArchitectureEditorState,
} from "./architecture-editor-state";

function component(id: string, name: string): ArchitectureComponent {
  return { id: id as ComponentId, name, kind: "service" };
}

describe("Auto-layout editor action failure", () => {
  it("preserves the current workspace, history, and redo on layout failure", () => {
    const withApi = ArchitectureGraph.empty().addComponent(
      component("api", "API"),
    );
    if (!withApi.ok) return;
    const state = createArchitectureEditorState(withApi.graph);
    const added = addComponentToEditorState(
      state,
      component("database", "Database"),
    );
    if (!added.ok) return;
    const historyWithChange = recordArchitectureEditorState(
      createArchitectureEditorHistory(state),
      added.state,
    );
    const historyWithRedo = undoArchitectureEditorHistory(historyWithChange);
    const presentBeforeFailure = historyWithRedo.present;
    const futureBeforeFailure = historyWithRedo.future;
    const result = recordAutoLayoutFromEditorAction(historyWithRedo);

    expect(result).toEqual({
      ok: false,
      error: { type: "layout-failed" },
    });
    expect(historyWithRedo.present).toBe(presentBeforeFailure);
    expect(historyWithRedo.present.graph.getComponents()).toEqual(
      presentBeforeFailure.graph.getComponents(),
    );
    expect(historyWithRedo.present.nodePositions).toBe(
      presentBeforeFailure.nodePositions,
    );
    expect(historyWithRedo.future).toBe(futureBeforeFailure);
  });
});
