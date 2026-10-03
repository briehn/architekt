import { describe, expect, it } from "vitest";

import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { analyzeArchitecture } from "../application/architecture-analysis/architecture-analysis";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import {
  createArchitectureEditorHistory,
  commitArchitectureEditorHistoryTransaction,
  recordArchitectureEditorState,
  replaceArchitectureEditorStateWithoutHistory,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  addBoundaryToEditorState,
  addComponentToEditorState,
  addConnectionToEditorState,
  applyReactFlowNodeChangesToEditorState,
  assignComponentToBoundaryInEditorState,
  autoLayoutArchitectureEditorState,
  changeComponentKindInEditorState,
  changeConnectionKindInEditorState,
  createArchitectureEditorState,
  createEmptyArchitectureEditorState,
  type ArchitectureEditorState,
  hasCanonicalArchitectureEditorContent,
  removeBoundaryFromEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
  renameBoundaryInEditorState,
  renameComponentInEditorState,
} from "./architecture-editor-state";
import { captureBoundaryMovement, translateBoundaryMembers } from "./boundary-movement";
import { replaceDesignContextInEditorState } from "./design-context-editor-state";

function populatedContext() {
  return {
    ...EMPTY_DESIGN_CONTEXT,
    title: "URL shortener",
    requirementsAndConstraints: "10M daily users",
  };
}

describe("document-level context edits", () => {
  it("commits once, keeps graph and positions, and restores through Undo/Redo", () => {
    const initial = createArchitectureEditorState(ArchitectureGraph.empty());
    const submitted = populatedContext();
    const result = replaceDesignContextInEditorState(initial, submitted);
    if (!result.ok) throw new Error("Expected accepted context");
    const history = recordArchitectureEditorState(createArchitectureEditorHistory(initial), result.state);
    expect(history.past).toHaveLength(1);
    expect(history.present.graph).toBe(initial.graph);
    expect(history.present.nodePositions).toBe(initial.nodePositions);
    expect(history.present.nodeMeasurements).toBe(initial.nodeMeasurements);
    expect(history.present.designContext).toEqual(submitted);
    expect(history.present.designContext).not.toBe(submitted);
    expect(initial.designContext).toBe(EMPTY_DESIGN_CONTEXT);
    expect(hasCanonicalArchitectureEditorContent(history.present)).toBe(true);
    expect(hasCanonicalArchitectureEditorContent(initial)).toBe(false);
    const undone = undoArchitectureEditorHistory(history);
    expect(undone.present.designContext).toBe(EMPTY_DESIGN_CONTEXT);
    expect(redoArchitectureEditorHistory(undone).present.designContext).toBe(history.present.designContext);
  });

  it("rejects invalid input and preserves exact state/history on no-op Save", () => {
    const initial = createArchitectureEditorState(ArchitectureGraph.empty());
    const changed = replaceDesignContextInEditorState(initial, populatedContext());
    if (!changed.ok) throw new Error("Expected accepted context");
    const history = recordArchitectureEditorState(createArchitectureEditorHistory(initial), changed.state);
    const withRedo = undoArchitectureEditorHistory(history);
    const noOp = replaceDesignContextInEditorState(withRedo.present, { ...EMPTY_DESIGN_CONTEXT });
    if (!noOp.ok) throw new Error("Expected no-op context");
    expect(noOp.state).toBe(withRedo.present);
    expect(recordArchitectureEditorState(withRedo, noOp.state)).toBe(withRedo);
    const invalid = replaceDesignContextInEditorState(changed.state, { ...populatedContext(), title: "x".repeat(121) });
    expect(invalid).toEqual({ ok: false, error: { type: "invalid-field", field: "title", reason: "too-long" } });
    expect(changed.state.designContext.title).toBe("URL shortener");
  });

  it("preserves context through graph, membership, and layout edits", () => {
    const initial = createArchitectureEditorState(ArchitectureGraph.empty());
    const saved = replaceDesignContextInEditorState(initial, populatedContext());
    if (!saved.ok) throw new Error("Expected accepted context");
    const componentId = "service" as ComponentId;
    const added = addComponentToEditorState(saved.state, { id: componentId, name: "Service", kind: "service" });
    if (!added.ok) throw new Error("Expected component");
    const bounded = addBoundaryToEditorState(added.state, { id: "tier" as BoundaryId, name: "Tier", memberComponentIds: [] });
    if (!bounded.ok) throw new Error("Expected boundary");
    const assigned = assignComponentToBoundaryInEditorState(bounded.state, componentId, "tier" as BoundaryId);
    if (!assigned.ok) throw new Error("Expected membership");
    const arranged = autoLayoutArchitectureEditorState(assigned.state);
    if (!arranged.ok) throw new Error("Expected layout");
    for (const state of [added.state, bounded.state, assigned.state, arranged.state]) {
      expect(state.designContext).toBe(saved.state.designContext);
    }
    expect(hasCanonicalArchitectureEditorContent(bounded.state)).toBe(true);
  });

  it("carries context through component, connection, and boundary edit operations", () => {
    const original = createArchitectureEditorState(ArchitectureGraph.empty());
    const saved = replaceDesignContextInEditorState(original, populatedContext());
    if (!saved.ok) throw new Error("Expected context");
    const context = saved.state.designContext;
    function accepted(result: { ok: true; state: ArchitectureEditorState } | { ok: false; error: unknown }) {
      if (!result.ok) throw new Error("Expected accepted edit");
      expect(result.state.designContext).toBe(context);
      return result.state;
    }
    const service = "service" as ComponentId;
    const database = "database" as ComponentId;
    let state = accepted(addComponentToEditorState(saved.state, { id: service, name: "Service", kind: "service" }));
    state = accepted(addComponentToEditorState(state, { id: database, name: "Database", kind: "database" }));
    state = accepted(renameComponentInEditorState(state, service, "API"));
    state = accepted(changeComponentKindInEditorState(state, service, "gateway"));
    const connection = "link" as ConnectionId;
    state = accepted(addConnectionToEditorState(state, { id: connection, sourceComponentId: service, targetComponentId: database, kind: "generic" }));
    state = accepted(changeConnectionKindInEditorState(state, connection, "data-access"));
    state = accepted(removeConnectionFromEditorState(state, connection));
    const boundary = "tier" as BoundaryId;
    state = accepted(addBoundaryToEditorState(state, { id: boundary, name: "Tier", memberComponentIds: [service] }));
    state = accepted(renameBoundaryInEditorState(state, boundary, "Request tier"));
    state = accepted(removeBoundaryFromEditorState(state, boundary));
    state = accepted(removeComponentFromEditorState(state, database));
    expect(state.graph.getComponents()).toHaveLength(1);
    expect(saved.state.graph.getComponents()).toHaveLength(0);
  });

  it("preserves context through component and boundary movement", () => {
    let graph = ArchitectureGraph.empty();
    const componentId = "service" as ComponentId;
    const added = graph.addComponent({ id: componentId, name: "Service", kind: "service" });
    if (!added.ok) throw new Error("Expected component");
    graph = added.graph;
    const bounded = graph.addBoundary({ id: "tier" as BoundaryId, name: "Tier", memberComponentIds: [componentId] });
    if (!bounded.ok) throw new Error("Expected boundary");
    const saved = replaceDesignContextInEditorState(createArchitectureEditorState(bounded.graph), populatedContext());
    if (!saved.ok) throw new Error("Expected context");
    const dragged = applyReactFlowNodeChangesToEditorState(saved.state, [
      { type: "position", id: componentId, position: { x: 200, y: 120 }, dragging: true },
    ]);
    expect(dragged.designContext).toBe(saved.state.designContext);
    const capture = captureBoundaryMovement(dragged, "tier" as BoundaryId);
    if (!capture) throw new Error("Expected boundary capture");
    const moved = translateBoundaryMembers(dragged, capture, { x: 30, y: -10 });
    expect(moved.designContext).toBe(saved.state.designContext);
  });

  it("does not let a stale drag transaction overwrite a newer context commit", () => {
    const added = ArchitectureGraph.empty().addComponent({ id: "service" as ComponentId, name: "Service", kind: "service" });
    if (!added.ok) throw new Error("Expected component");
    const initial = createArchitectureEditorHistory(createArchitectureEditorState(added.graph));
    const moved = replaceArchitectureEditorStateWithoutHistory(initial,
      applyReactFlowNodeChangesToEditorState(initial.present, [
        { type: "position", id: "service", position: { x: 220, y: 80 }, dragging: true },
      ]),
    );
    const changed = replaceDesignContextInEditorState(moved.present, populatedContext());
    if (!changed.ok) throw new Error("Expected context");
    const committed = recordArchitectureEditorState(moved, changed.state);
    expect(commitArchitectureEditorHistoryTransaction(initial, committed)).toBe(committed);
    expect(committed.present.designContext.title).toBe("URL shortener");
    expect(committed.present.nodePositions.get("service" as ComponentId)).toEqual({ x: 220, y: 80 });
  });

  it("keeps Analysis graph-only and Reset clears all canonical content", () => {
    const isolated = ArchitectureGraph.empty().addComponent({
      id: "isolated" as ComponentId, name: "Isolated", kind: "service",
    });
    if (!isolated.ok) throw new Error("Expected component");
    const initial = createArchitectureEditorState(isolated.graph);
    const saved = replaceDesignContextInEditorState(initial, populatedContext());
    if (!saved.ok) throw new Error("Expected context");
    expect(analyzeArchitecture(initial.graph).findings.length).toBeGreaterThan(0);
    expect(analyzeArchitecture(saved.state.graph)).toEqual(analyzeArchitecture(initial.graph));
    const reset = createEmptyArchitectureEditorState();
    expect(reset.graph.getComponents()).toEqual([]);
    expect(reset.graph.getBoundaries()).toEqual([]);
    expect(reset.nodePositions.size).toBe(0);
    expect(reset.designContext).toBe(EMPTY_DESIGN_CONTEXT);
    expect(hasCanonicalArchitectureEditorContent(reset)).toBe(false);
  });
});
