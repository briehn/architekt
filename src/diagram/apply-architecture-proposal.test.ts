import { describe, expect, it } from "vitest";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { ArchitectureGraph } from "../domain/architecture-graph";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";
import { applyArchitectureProposal } from "./apply-architecture-proposal";
import { createArchitectureEditorHistory, redoArchitectureEditorHistory, undoArchitectureEditorHistory } from "./architecture-editor-history";
import { createArchitectureEditorState, createFreshArchitectureEditorState } from "./architecture-editor-state";

function ids() {
  let component = 0;
  let connection = 0;
  return {
    createComponentId: () => `new-component-${++component}` as ComponentId,
    createConnectionId: () => `new-connection-${++connection}` as ConnectionId,
  };
}

describe("atomic proposal Apply", () => {
  for (const initial of ["empty", "non-empty"] as const) {
    it(`replaces an ${initial} workspace in one undoable transition`, () => {
      const graph = initial === "empty" ? ArchitectureGraph.empty() :
        ArchitectureGraph.empty().addComponent({ id: "old" as ComponentId, name: "Old", kind: "service" });
      if (!(graph instanceof ArchitectureGraph) && !graph.ok) throw new Error("Fixture failed");
      const initialGraph = graph instanceof ArchitectureGraph ? graph : graph.graph;
      const state = createFreshArchitectureEditorState(initialGraph);
      const measuredState = { ...state, nodeMeasurements: new Map([["old" as ComponentId, { width: 200, height: 80 }]]) };
      const history = createArchitectureEditorHistory(measuredState);
      const result = applyArchitectureProposal(history, minimalProposal(), ids());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.history.past).toHaveLength(1);
      expect(result.history.present.graph.getComponents()).toHaveLength(3);
      expect(result.history.present.nodePositions).toHaveProperty("size", 3);
      expect(result.history.present.nodeMeasurements.size).toBe(0);
      expect(result.history.present.graph.getComponents()[0].id).toBe("new-component-1");
      const undone = undoArchitectureEditorHistory(result.history);
      expect(undone.present.graph).toBe(initialGraph);
      expect(undone.present.nodePositions).toBe(state.nodePositions);
      const redone = redoArchitectureEditorHistory(undone);
      expect(redone.present.graph).toBe(result.history.present.graph);
      expect(redone.present.nodePositions).toBe(result.history.present.nodePositions);
      const document = toPersistedArchitectureEditorDocument(result.history.present);
      expect(document.schemaVersion).toBe(3);
      expect(JSON.stringify(document)).not.toMatch(/prompt|summary|assumptions|proposal|old/);
      expect(JSON.stringify(result.history)).not.toMatch(/prompt|summary|assumptions|proposal/);
    });
  }

  it("keeps history and workspace intact if translation fails", () => {
    const history = createArchitectureEditorHistory(createArchitectureEditorState(ArchitectureGraph.empty()));
    const result = applyArchitectureProposal(history, minimalProposal(), {
      createComponentId: () => "duplicate" as ComponentId,
      createConnectionId: () => "duplicate" as ConnectionId,
    });
    expect(result).toMatchObject({ ok: false, error: "invalid-proposal" });
    expect(history.past).toHaveLength(0);
    expect(history.present.graph.getComponents()).toHaveLength(0);
  });
});
