import { describe, expect, it } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { addConnectionToEditorState, createArchitectureEditorState } from "./architecture-editor-state";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
} from "./architecture-editor-history";
import { withAdaptiveEdgeAnchors } from "./adaptive-anchor-renderer";
import {
  activatePointerConnectionAnchor,
  clearDeletedPointerConnectionSource,
  shouldCancelPendingPointerConnectionOnEscape,
} from "./pointer-connection-controller";
import {
  toArchitectureConnectionFromIntent,
  toReactFlowDiagram,
} from "./react-flow-adapter";
import { withReciprocalEdgeTypes } from "./reciprocal-edge-renderer";

const a = "a" as ComponentId;
const b = "b" as ComponentId;

function historyWithTwoComponents() {
  const first = ArchitectureGraph.empty().addComponent({
    id: a, name: "Service", kind: "service",
  });
  if (!first.ok) throw new Error("Expected first component.");
  const second = first.graph.addComponent({
    id: b, name: "Cache", kind: "cache",
  });
  if (!second.ok) throw new Error("Expected second component.");
  return createArchitectureEditorHistory(createArchitectureEditorState(second.graph));
}

describe("pointer connection activation", () => {
  it.each(["top", "right", "bottom", "left"] as const)(
    "starts from the %s anchor without creating canonical or history state",
    (side) => {
      const history = historyWithTwoComponents();
      const activation = activatePointerConnectionAnchor(null, a, side);

      expect(activation).toEqual({
        pendingSource: { componentId: a, side },
        connectionIntent: null,
      });
      expect(history.present.graph.getConnections()).toEqual([]);
      expect(history.past).toEqual([]);
    },
  );

  it.each(["top", "right", "bottom", "left"] as const)(
    "finishes on the %s anchor while preserving activation-order direction",
    (side) => {
      const initialHistory = historyWithTwoComponents();
      const started = activatePointerConnectionAnchor(null, a, "left");
      const completed = activatePointerConnectionAnchor(
        started.pendingSource, b, side,
      );
      expect(completed.pendingSource).toBeNull();
      expect(completed.connectionIntent).toEqual({
        sourceComponentId: a, targetComponentId: b,
      });

      const connection = toArchitectureConnectionFromIntent(
        completed.connectionIntent!,
        "click-a-b" as ConnectionId,
      );
      const result = addConnectionToEditorState(initialHistory.present, connection);
      if (!result.ok) throw new Error("Expected accepted pointer connection.");
      const history = recordArchitectureEditorState(initialHistory, result.state);

      expect(connection).toEqual({
        id: "click-a-b", sourceComponentId: a, targetComponentId: b,
        kind: "generic",
      });
      expect(history.past).toHaveLength(1);
      expect(history.present.graph.getConnections()).toEqual([connection]);
      expect(history.present.nodePositions).toBe(initialHistory.present.nodePositions);
    },
  );

  it("keeps the same source pending while changing its visual side", () => {
    const started = activatePointerConnectionAnchor(null, a, "top");
    const changedSide = activatePointerConnectionAnchor(
      started.pendingSource, a, "bottom",
    );

    expect(changedSide).toEqual({
      pendingSource: { componentId: a, side: "bottom" },
      connectionIntent: null,
    });
  });

  it("cancels only non-editable Escape, leaving rename Escape to rename", () => {
    const pending = activatePointerConnectionAnchor(null, a, "right").pendingSource;

    expect(shouldCancelPendingPointerConnectionOnEscape(
      pending, "Escape", false, false,
    )).toBe(true);
    expect(shouldCancelPendingPointerConnectionOnEscape(
      pending, "Escape", true, false,
    )).toBe(false);
    expect(shouldCancelPendingPointerConnectionOnEscape(
      pending, "Escape", false, true,
    )).toBe(false);
    expect(shouldCancelPendingPointerConnectionOnEscape(
      null, "Escape", false, false,
    )).toBe(false);
    expect(shouldCancelPendingPointerConnectionOnEscape(
      pending, "Enter", false, false,
    )).toBe(false);
  });

  it("drops a deleted pending source without changing another pending source", () => {
    const pending = activatePointerConnectionAnchor(null, a, "top").pendingSource;

    expect(clearDeletedPointerConnectionSource(pending, a)).toBeNull();
    expect(clearDeletedPointerConnectionSource(pending, b)).toBe(pending);
  });

  it("leaves rejection and reciprocal policy to the existing editor/domain path", () => {
    const initialHistory = historyWithTwoComponents();
    const self = addConnectionToEditorState(
      initialHistory.present,
      toArchitectureConnectionFromIntent(
        { sourceComponentId: a, targetComponentId: a },
        "self" as ConnectionId,
      ),
    );
    expect(self).toMatchObject({
      ok: false,
      error: { type: "source-and-target-component-ids-are-the-same" },
    });
    expect(initialHistory.past).toHaveLength(0);

    const forward = addConnectionToEditorState(
      initialHistory.present,
      toArchitectureConnectionFromIntent(
        { sourceComponentId: a, targetComponentId: b },
        "a-b" as ConnectionId,
      ),
    );
    if (!forward.ok) throw new Error("Expected forward connection.");
    const forwardHistory = recordArchitectureEditorState(
      initialHistory, forward.state,
    );
    const duplicate = addConnectionToEditorState(
      forwardHistory.present,
      toArchitectureConnectionFromIntent(
        { sourceComponentId: a, targetComponentId: b },
        "duplicate" as ConnectionId,
      ),
    );
    expect(duplicate).toMatchObject({
      ok: false, error: { type: "connection-already-exists" },
    });
    expect(forwardHistory.past).toHaveLength(1);

    const reverseStart = activatePointerConnectionAnchor(null, b, "top");
    const reverseCompletion = activatePointerConnectionAnchor(
      reverseStart.pendingSource, a, "right",
    );
    expect(reverseCompletion.pendingSource).toBeNull();
    const reverse = addConnectionToEditorState(
      forwardHistory.present,
      toArchitectureConnectionFromIntent(
        reverseCompletion.connectionIntent!,
        "b-a" as ConnectionId,
      ),
    );
    if (!reverse.ok) throw new Error("Expected reciprocal connection.");
    expect(reverse.state.graph.getConnections()).toMatchObject([
      { sourceComponentId: a, targetComponentId: b, kind: "generic" },
      { sourceComponentId: b, targetComponentId: a, kind: "generic" },
    ]);

    const diagram = toReactFlowDiagram(
      reverse.state.graph,
      reverse.state.nodePositions,
    );
    expect(
      withReciprocalEdgeTypes(
        withAdaptiveEdgeAnchors(diagram.edges, diagram.nodes),
      ),
    ).toMatchObject([
      { type: "reciprocal", data: { kind: "generic" } },
      { type: "reciprocal", data: { kind: "generic" } },
    ]);
  });
});
