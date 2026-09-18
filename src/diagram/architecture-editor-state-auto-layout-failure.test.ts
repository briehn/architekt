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

describe("autoLayoutArchitectureEditorState failure handling", () => {
  it("returns a typed failure without changing the current workspace", () => {
    const api: ArchitectureComponent = {
      id: "api" as ComponentId,
      name: "API",
      kind: "service",
    };
    const addResult = ArchitectureGraph.empty().addComponent(api);

    if (!addResult.ok) {
      throw new Error("Expected the component to be added.");
    }

    const initialState = createArchitectureEditorState(addResult.graph);
    const measurements = new Map([[api.id, { width: 220, height: 90 }]]);
    const state = {
      ...initialState,
      nodeMeasurements: measurements,
    };
    const graphReference = state.graph;
    const positionsReference = state.nodePositions;

    expect(autoLayoutArchitectureEditorState(state)).toEqual({
      ok: false,
      error: { type: "layout-failed" },
    });
    expect(state.graph).toBe(graphReference);
    expect(state.nodePositions).toBe(positionsReference);
    expect(state.nodeMeasurements).toBe(measurements);
  });
});
