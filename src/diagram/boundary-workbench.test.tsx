import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import { createArchitectureEditorState } from "./architecture-editor-state";
import { createArchitectureEditorHistory, redoArchitectureEditorHistory, undoArchitectureEditorHistory } from "./architecture-editor-history";
import { BoundaryCreationForm, BoundaryDetails, BoundaryMembershipSelect, getBoundaryDisplayName } from "./boundary-workbench";
import { canEditBoundaries, getEligibleBoundaryCreationMembers, recordBoundaryCreation, recordBoundaryDeletion, recordBoundaryMembershipChange, recordBoundaryRename } from "./boundary-workbench-actions";

const api = "api" as ComponentId;
const database = "database" as ComponentId;
const queue = "queue" as ComponentId;
const alpha = "alpha" as BoundaryId;
const beta = "beta" as BoundaryId;

function graphWithComponents() {
  let graph = ArchitectureGraph.empty();
  for (const [id, name, kind] of [
    [api, "API", "service"],
    [database, "Database", "database"],
    [queue, "Queue", "queue"],
  ] as const) {
    const result = graph.addComponent({ id, name, kind });
    if (!result.ok) throw new Error("Fixture rejected");
    graph = result.graph;
  }
  return graph;
}

function history() { return createArchitectureEditorHistory(createArchitectureEditorState(graphWithComponents())); }

describe("boundary workbench application actions", () => {
  it("defers canonical boundary controls during drag, rename, or pending connection", () => {
    expect(canEditBoundaries(false, false, false)).toBe(true);
    expect(canEditBoundaries(true, false, false)).toBe(false);
    expect(canEditBoundaries(false, true, false)).toBe(false);
    expect(canEditBoundaries(false, false, true)).toBe(false);
  });
  it("prefills only selected, ungrouped components and renders grouped choices unavailable", () => {
    const initial = history();
    const created = recordBoundaryCreation(initial, { id: alpha, name: "Existing", memberComponentIds: [api] });
    if (!created.ok) throw new Error(created.message);
    const graph = created.history.present.graph;
    expect(getEligibleBoundaryCreationMembers(graph, new Set([api, database]))).toEqual([database]);
    const markup = renderToStaticMarkup(<BoundaryCreationForm graph={graph} initialMemberIds={[database]} disabled={false} onCreate={() => created} onCancel={() => {}} />);
    expect(markup).toContain("In Existing");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('checked=""');
  });

  it("creates empty and populated boundaries atomically with one undo step each", () => {
    const initial = history();
    const empty = recordBoundaryCreation(initial, { id: alpha, name: "Payments", memberComponentIds: [] });
    if (!empty.ok) throw new Error(empty.message);
    expect(empty.history.past).toHaveLength(1);
    expect(empty.history.present.graph.getBoundaryById(alpha)?.memberComponentIds).toEqual([]);
    const populated = recordBoundaryCreation(empty.history, { id: beta, name: "Payments", memberComponentIds: [api, database] });
    if (!populated.ok) throw new Error(populated.message);
    expect(populated.history.past).toHaveLength(2);
    expect(populated.history.present.graph.getBoundaryById(beta)?.memberComponentIds).toEqual([api, database]);
    expect(undoArchitectureEditorHistory(populated.history).present.graph.getBoundaryById(beta)).toBeUndefined();
    expect(redoArchitectureEditorHistory(undoArchitectureEditorHistory(populated.history)).present.graph.getBoundaryById(beta)?.memberComponentIds).toEqual([api, database]);
  });

  it("maps creation rejection to safe messages without changing history", () => {
    const initial = history();
    expect(recordBoundaryCreation(initial, { id: alpha, name: "  ", memberComponentIds: [] })).toEqual({ ok: false, message: "Enter a boundary name." });
    const created = recordBoundaryCreation(initial, { id: alpha, name: "A", memberComponentIds: [api] });
    if (!created.ok) throw new Error(created.message);
    const conflict = recordBoundaryCreation(created.history, { id: beta, name: "B", memberComponentIds: [api] });
    expect(conflict).toMatchObject({ ok: false, message: expect.stringContaining("already belongs") });
    expect(created.history.present.graph.getBoundaries()).toHaveLength(1);
  });

  it("transfers, ungroups, reuses an empty boundary, and preserves positions", () => {
    const initial = history();
    const first = recordBoundaryCreation(initial, { id: alpha, name: "A", memberComponentIds: [api] });
    if (!first.ok) throw new Error(first.message);
    const second = recordBoundaryCreation(first.history, { id: beta, name: "B", memberComponentIds: [] });
    if (!second.ok) throw new Error(second.message);
    const moved = recordBoundaryMembershipChange(second.history, api, beta);
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.history.past).toHaveLength(3);
    expect(moved.history.present.graph.getBoundaryById(alpha)?.memberComponentIds).toEqual([]);
    expect(moved.history.present.graph.getBoundaryById(beta)?.memberComponentIds).toEqual([api]);
    expect(moved.history.present.nodePositions).toBe(second.history.present.nodePositions);
    const same = recordBoundaryMembershipChange(moved.history, api, beta);
    expect(same).toMatchObject({ ok: true, changed: false });
    if (!same.ok) throw new Error(same.message);
    expect(same.history).toBe(moved.history);
    const removed = recordBoundaryMembershipChange(moved.history, api, null);
    if (!removed.ok) throw new Error(removed.message);
    expect(removed.history.present.graph.getBoundaryById(beta)?.memberComponentIds).toEqual([]);
    expect(undoArchitectureEditorHistory(removed.history).present.graph.getBoundaryById(beta)?.memberComponentIds).toEqual([api]);
  });

  it("renames with no-op identity and deletes grouping while keeping components", () => {
    const initial = history();
    const created = recordBoundaryCreation(initial, { id: alpha, name: "A", memberComponentIds: [api] });
    if (!created.ok) throw new Error(created.message);
    const same = recordBoundaryRename(created.history, alpha, "A");
    expect(same).toMatchObject({ ok: true, changed: false });
    const renamed = recordBoundaryRename(created.history, alpha, "B");
    if (!renamed.ok) throw new Error(renamed.message);
    expect(renamed.history.present.graph.getBoundaryById(alpha)?.name).toBe("B");
    const deleted = recordBoundaryDeletion(renamed.history, alpha);
    if (!deleted.ok) throw new Error(deleted.message);
    expect(deleted.history.present.graph.getComponents()).toEqual(initial.present.graph.getComponents());
    expect(deleted.history.present.graph.getBoundaryById(alpha)).toBeUndefined();
    expect(undoArchitectureEditorHistory(deleted.history).present.graph.getBoundaryById(alpha)?.name).toBe("B");
  });

  it("renders details and native membership options with clear semantics", () => {
    const initial = history();
    const created = recordBoundaryCreation(initial, { id: alpha, name: "Payments", memberComponentIds: [] });
    if (!created.ok) throw new Error(created.message);
    const boundary = created.history.present.graph.getBoundaryById(alpha)!;
    const details = renderToStaticMarkup(<BoundaryDetails boundary={boundary} graph={created.history.present.graph} disabled={false} onBack={() => {}} onRename={() => created} onDelete={() => created} onAssign={() => created} onRemove={() => created} />);
    expect(details).toContain("No canvas rectangle until a component joins");
    expect(details).toContain("keeps its components and connections");
    const select = renderToStaticMarkup(<BoundaryMembershipSelect componentId={api} componentName="API" boundaries={[boundary]} currentBoundaryId={null} disabled={false} onChange={() => {}} />);
    expect(select).toContain('aria-label="Boundary for API (api)"');
    expect(select).toContain("No boundary");
    expect(select).toContain("Payments");
  });

  it("disambiguates duplicate visible boundary names in controls", () => {
    const first = { id: alpha, name: "Shared", memberComponentIds: [] };
    const second = { id: beta, name: "Shared", memberComponentIds: [] };
    expect(getBoundaryDisplayName(first, [first, second])).toBe("Shared (alpha)");
    const select = renderToStaticMarkup(<BoundaryMembershipSelect componentId={api} componentName="API" boundaries={[first, second]} currentBoundaryId={null} disabled={false} onChange={() => {}} />);
    expect(select).toContain("Shared (alpha)");
    expect(select).toContain("Shared (beta)");
  });
});
