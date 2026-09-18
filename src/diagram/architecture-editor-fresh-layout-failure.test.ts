import { describe, expect, it, vi } from "vitest";

vi.mock("./auto-layout", () => ({
  layoutArchitectureGraph: () => ({
    ok: false,
    error: { type: "layout-failed" },
  }),
}));

import {
  createExampleArchitectureEditorState,
  createFreshExampleArchitectureEditorHistory,
} from "./architecture-editor";

describe("fresh example layout failure handling", () => {
  it("falls back to the legacy row placement and still creates an empty history", () => {
    const state = createExampleArchitectureEditorState();
    const history = createFreshExampleArchitectureEditorHistory();

    expect(state.graph.getComponents()).toEqual([
      { id: "api", name: "API", kind: "service" },
      { id: "database", name: "Database", kind: "database" },
    ]);
    expect(state.graph.getConnections()).toEqual([
      {
        id: "api-to-database",
        sourceComponentId: "api",
        targetComponentId: "database",
        kind: "data-access",
      },
    ]);
    expect(state.nodePositions).toEqual(
      new Map([
        ["api", { x: 0, y: 0 }],
        ["database", { x: 240, y: 0 }],
      ]),
    );
    expect(state.nodeMeasurements).toEqual(new Map());
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.present.nodePositions).toEqual(state.nodePositions);
  });
});
