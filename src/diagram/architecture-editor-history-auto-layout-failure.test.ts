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
import {
  autoLayoutArchitectureEditorState,
  createArchitectureEditorState,
} from "./architecture-editor-state";
import {
  canRedoArchitectureEditorHistory,
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import { moveDiagramNode } from "./diagram-layout";

describe("ArchitectureEditorHistory auto-layout failure handling", () => {
  it("does not record a failed layout or disturb the current history and redo", () => {
    const api: ArchitectureComponent = {
      id: "api" as ComponentId,
      name: "API",
      kind: "service",
    };
    const addResult = ArchitectureGraph.empty().addComponent(api);

    if (!addResult.ok) {
      throw new Error("Expected the component to be added.");
    }

    const initialState = {
      ...createArchitectureEditorState(addResult.graph),
      nodeMeasurements: new Map([[api.id, { width: 220, height: 90 }]]),
    };
    const movedState = {
      ...initialState,
      nodePositions: moveDiagramNode(
        initialState.nodePositions,
        api.id,
        { x: 120, y: 80 },
      ),
    };
    const historyWithFuture = undoArchitectureEditorHistory(
      recordArchitectureEditorState(
        createArchitectureEditorHistory(initialState),
        movedState,
      ),
    );
    const historyReference = historyWithFuture;
    const pastReference = historyWithFuture.past;
    const futureReference = historyWithFuture.future;
    const presentReference = historyWithFuture.present;
    const layoutResult = autoLayoutArchitectureEditorState(
      historyWithFuture.present,
    );

    expect(layoutResult).toEqual({
      ok: false,
      error: { type: "layout-failed" },
    });
    expect(historyWithFuture).toBe(historyReference);
    expect(historyWithFuture.past).toBe(pastReference);
    expect(historyWithFuture.future).toBe(futureReference);
    expect(historyWithFuture.present).toBe(presentReference);
    expect(historyWithFuture.present.graph.getComponents()).toEqual([api]);
    expect(historyWithFuture.present.nodePositions).toEqual(
      initialState.nodePositions,
    );
    expect(historyWithFuture.present.nodeMeasurements).toBe(
      initialState.nodeMeasurements,
    );
    expect(canRedoArchitectureEditorHistory(historyWithFuture)).toBe(true);
  });
});
