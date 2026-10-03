import { describe, expect, it } from "vitest";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import { ArchitectureGraph } from "../domain/architecture-graph";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";
import { applyArchitectureProposal } from "./apply-architecture-proposal";
import { createArchitectureEditorHistory, redoArchitectureEditorHistory, undoArchitectureEditorHistory } from "./architecture-editor-history";
import { createArchitectureEditorState, createFreshArchitectureEditorState } from "./architecture-editor-state";
import { replaceDesignContextInEditorState } from "./design-context-editor-state";

function ids() {
  let component = 0;
  let connection = 0;
  return {
    createComponentId: () => `new-component-${++component}` as ComponentId,
    createConnectionId: () => `new-connection-${++connection}` as ConnectionId,
  };
}

describe("atomic proposal Apply", () => {
  it("replaces only structure and positions while preserving user-authored context", () => {
    const base = createArchitectureEditorState(ArchitectureGraph.empty());
    const edited = replaceDesignContextInEditorState(base, {
      ...base.designContext,
      title: "My brief",
      assumptionsAndOpenQuestions: "User assumption, not an AI claim",
    });
    if (!edited.ok) throw new Error("Expected context edit");
    const before = createArchitectureEditorHistory(edited.state);
    const applied = applyArchitectureProposal(before, minimalProposal(), ids());
    if (!applied.ok) throw new Error("Expected Apply");
    expect(applied.history.past).toHaveLength(1);
    expect(applied.history.present.designContext).toBe(edited.state.designContext);
    const undone = undoArchitectureEditorHistory(applied.history);
    expect(undone.present.designContext).toBe(edited.state.designContext);
    expect(undone.present.graph).toBe(edited.state.graph);
    expect(undone.present.nodePositions).toBe(edited.state.nodePositions);
    expect(redoArchitectureEditorHistory(undone).present.designContext).toBe(edited.state.designContext);
    expect(toPersistedArchitectureEditorDocument(applied.history.present).designContext.title).toBe("My brief");
  });

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
      expect(document.schemaVersion).toBe(5);
      expect(JSON.stringify(document)).not.toMatch(/prompt|summary|proposal|old/);
      expect(JSON.stringify(result.history)).not.toMatch(/prompt|summary|proposal/);
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

describe("proposal Apply over canonical boundaries", () => {
  it.each(["bounded", "boundary-only"] as const)(
    "replaces a %s workspace once and Undo restores boundaries, memberships, and positions",
    (kind) => {
      let graph = ArchitectureGraph.empty();
      if (kind === "bounded") {
        const component = graph.addComponent({
          id: "old" as ComponentId, name: "Old", kind: "service",
        });
        if (!component.ok) throw new Error("Invalid component fixture");
        graph = component.graph;
      }
      const boundary = graph.addBoundary({
        id: "old-boundary" as BoundaryId,
        name: "Old boundary",
        memberComponentIds: kind === "bounded" ? ["old" as ComponentId] : [],
      });
      if (!boundary.ok) throw new Error("Invalid boundary fixture");
      const prior = createFreshArchitectureEditorState(boundary.graph);
      const result = applyArchitectureProposal(createArchitectureEditorHistory(prior), minimalProposal(), ids());
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.history.past).toHaveLength(1);
      expect(result.history.present.graph.getBoundaries()).toEqual([]);
      const document = toPersistedArchitectureEditorDocument(result.history.present);
      expect(document.graph.boundaries).toEqual([]);
      expect(JSON.stringify(document)).not.toMatch(/prompt|summary|proposal/);
      const undone = undoArchitectureEditorHistory(result.history);
      expect(undone.present.graph).toBe(prior.graph);
      expect(undone.present.graph.getBoundaryById("old-boundary" as BoundaryId)?.memberComponentIds)
        .toEqual(kind === "bounded" ? ["old"] : []);
      expect(undone.present.nodePositions).toBe(prior.nodePositions);
      const redone = redoArchitectureEditorHistory(undone);
      expect(redone.present.graph.getBoundaries()).toEqual([]);
      expect(redone.present.graph).toBe(result.history.present.graph);
    },
  );

  it("keeps boundaries on failed Apply", () => {
    const boundary = ArchitectureGraph.empty().addBoundary({
      id: "old-boundary" as BoundaryId,
      name: "Old boundary",
      memberComponentIds: [],
    });
    if (!boundary.ok) throw new Error("Invalid boundary fixture");
    const history = createArchitectureEditorHistory(createArchitectureEditorState(boundary.graph));
    const result = applyArchitectureProposal(history, minimalProposal(), {
      createComponentId: () => "duplicate" as ComponentId,
      createConnectionId: () => "duplicate" as ConnectionId,
    });
    expect(result).toMatchObject({ ok: false, error: "invalid-proposal" });
    expect(history.present.graph).toBe(boundary.graph);
    expect(history.present.graph.getBoundaries()).toHaveLength(1);
    expect(history.past).toHaveLength(0);
  });
});
