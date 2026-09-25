import { describe, expect, it } from "vitest";

import type { ComponentId } from "../domain/identifiers";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";
import {
  applyCanvasNodeSelectionChanges,
  canDeleteSelectedCanvasComponents,
  createFreshExampleArchitectureEditorHistory,
  recordSelectedComponentDeletion,
} from "./architecture-editor";
import {
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";

describe("canvas selection and canonical deletion", () => {
  it.each([
    ["inline rename", true, false, false],
    ["node drag", false, true, false],
    ["text input", false, false, true],
    ["textarea", false, false, true],
    ["select", false, false, true],
    ["contenteditable", false, false, true],
  ] as const)("blocks deletion during %s", (_context, rename, drag, editable) => {
    expect(canDeleteSelectedCanvasComponents(rename, drag, editable)).toBe(false);
  });

  it("allows deletion with canvas selection and no editable or drag transaction", () => {
    expect(canDeleteSelectedCanvasComponents(false, false, false)).toBe(true);
  });

  it("cascades incident connections and restores the full prior graph and positions on undo", () => {
    const before = createFreshExampleArchitectureEditorHistory();
    const apiId = "api" as ComponentId;
    const priorPosition = before.present.nodePositions.get(apiId);
    const after = recordSelectedComponentDeletion(before, [apiId]);

    expect(after.past).toHaveLength(1);
    expect(after.present.graph.getComponents().map((component) => component.id)).toEqual(["database"]);
    expect(after.present.graph.getConnections()).toEqual([]);
    expect(after.present.nodePositions.has(apiId)).toBe(false);
    const undone = undoArchitectureEditorHistory(after);
    expect(undone.present.graph.getConnections()).toEqual(before.present.graph.getConnections());
    expect(undone.present.nodePositions.get(apiId)).toEqual(priorPosition);
    const redone = redoArchitectureEditorHistory(undone);
    expect(redone.present.graph.getComponents()).toEqual(after.present.graph.getComponents());
    expect(redone.present.nodePositions).toEqual(after.present.nodePositions);
  });

  it("treats a multi-selection deletion as one history entry and empty input as a no-op", () => {
    const before = createFreshExampleArchitectureEditorHistory();
    const after = recordSelectedComponentDeletion(before, [
      "api" as ComponentId, "database" as ComponentId,
    ]);
    expect(after.past).toHaveLength(1);
    expect(after.present.graph.getComponents()).toEqual([]);
    expect(after.present.nodePositions.size).toBe(0);
    expect(undoArchitectureEditorHistory(after).present.graph).toBe(before.present.graph);
    expect(recordSelectedComponentDeletion(before, [])).toBe(before);
  });

  it("keeps selection changes outside graph, history, and serialized V3 data", () => {
    const history = createFreshExampleArchitectureEditorHistory();
    const document = toPersistedArchitectureEditorDocument(history.present);
    const empty = new Set<ComponentId>();
    const selected = applyCanvasNodeSelectionChanges(empty, [
      { id: "api", type: "select", selected: true },
    ]);
    expect([...selected]).toEqual(["api"]);
    expect(applyCanvasNodeSelectionChanges(selected, [
      { id: "api", type: "select", selected: false },
    ]).size).toBe(0);
    expect(applyCanvasNodeSelectionChanges(empty, [
      { id: "api", type: "position", position: { x: 10, y: 10 } },
    ])).toBe(empty);
    expect(history.past).toHaveLength(0);
    expect(toPersistedArchitectureEditorDocument(history.present)).toEqual(document);
    expect(JSON.stringify(document)).not.toContain("selected");
  });
});
