import { describe, expect, it } from "vitest";

import type { ArchitectureBoundary } from "./architecture-boundary";
import type { ArchitectureComponent } from "./architecture-component";
import type { ArchitectureConnection } from "./architecture-connection";
import { ArchitectureGraph } from "./architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "./identifiers";

const id = (value: string): ComponentId => value as ComponentId;
const boundaryId = (value: string): BoundaryId => value as BoundaryId;
const connectionId = (value: string): ConnectionId => value as ConnectionId;

function component(value: string, name = value): ArchitectureComponent {
  return { id: id(value), name, kind: "service" };
}

function boundary(
  value: string,
  name: string,
  memberComponentIds: readonly ComponentId[] = [],
): ArchitectureBoundary {
  return { id: boundaryId(value), name, memberComponentIds };
}

function connection(
  value: string,
  sourceComponentId: ComponentId,
  targetComponentId: ComponentId,
): ArchitectureConnection {
  return {
    id: connectionId(value),
    sourceComponentId,
    targetComponentId,
    kind: "generic",
  };
}

function success(result: {
  ok: boolean;
  graph?: ArchitectureGraph;
}): ArchitectureGraph {
  expect(result.ok).toBe(true);
  if (!result.ok || !result.graph) throw new Error("Expected graph operation to succeed.");
  return result.graph;
}

function graphWithThreeComponents(): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();
  for (const value of ["a", "b", "c"]) {
    graph = success(graph.addComponent(component(value)));
  }
  return graph;
}

describe("ArchitectureGraph boundaries", () => {
  it("starts with no boundaries and accepts an empty boundary with a component-like ID", () => {
    const empty = ArchitectureGraph.empty();
    expect(empty.getBoundaries()).toEqual([]);
    expect(empty.getBoundaryById(boundaryId("same"))).toBeUndefined();
    expect(empty.getBoundaryContainingComponent(id("same"))).toBeUndefined();

    const graph = success(empty.addComponent(component("same")));
    const grouped = success(graph.addBoundary(boundary("same", "  Boundary  ")));
    expect(grouped.getBoundaries()).toEqual([boundary("same", "  Boundary  ")]);
    expect(graph.getBoundaries()).toEqual([]);
  });

  it("allows duplicate visible names and canonically sorts members by ID", () => {
    const base = graphWithThreeComponents();
    const first = success(base.addBoundary(boundary("one", "Shared", [id("c"), id("a")])));
    const second = success(first.addBoundary(boundary("two", "Shared", [id("b")])));
    expect(second.getBoundaries()).toEqual([
      boundary("one", "Shared", [id("a"), id("c")]),
      boundary("two", "Shared", [id("b")]),
    ]);
    expect(second.getBoundaryContainingComponent(id("a"))).toEqual(
      boundary("one", "Shared", [id("a"), id("c")]),
    );
  });

  it("returns boundaries in ID order regardless of creation order", () => {
    const base = graphWithThreeComponents();
    const first = success(success(base.addBoundary(boundary("z", "Last")))
      .addBoundary(boundary("a", "First")));
    const second = success(success(base.addBoundary(boundary("a", "First")))
      .addBoundary(boundary("z", "Last")));
    expect(first.getBoundaries()).toEqual(second.getBoundaries());
    expect(first.getBoundaries().map((value) => value.id)).toEqual([
      boundaryId("a"), boundaryId("z"),
    ]);
  });

  it("rejects duplicate IDs and blank names without changing the graph", () => {
    const base = graphWithThreeComponents();
    const graph = success(base.addBoundary(boundary("one", "First", [id("a")])));
    expect(graph.addBoundary(boundary("one", "Duplicate"))).toEqual({
      ok: false,
      error: { type: "boundary-id-already-exists", boundaryId: boundaryId("one") },
    });
    expect(graph.addBoundary(boundary("other", " \t\n "))).toEqual({
      ok: false,
      error: { type: "boundary-name-empty", boundaryId: boundaryId("other") },
    });
    expect(graph.getBoundaries()).toEqual([boundary("one", "First", [id("a")])]);
  });

  it("validates the complete member list before creation and rejects missing, duplicate, or occupied members", () => {
    const base = graphWithThreeComponents();
    const graph = success(base.addBoundary(boundary("one", "First", [id("a")])));
    expect(graph.addBoundary(boundary("two", "Next", [id("b"), id("missing")]))).toEqual({
      ok: false,
      error: { type: "member-component-id-does-not-exist", componentId: id("missing") },
    });
    expect(graph.addBoundary(boundary("two", "Next", [id("b"), id("b")]))).toEqual({
      ok: false,
      error: { type: "duplicate-member-component-id", componentId: id("b") },
    });
    expect(graph.addBoundary(boundary("two", "Next", [id("b"), id("a")]))).toEqual({
      ok: false,
      error: {
        type: "member-component-already-in-boundary",
        componentId: id("a"),
        boundaryId: boundaryId("one"),
      },
    });
    expect(graph.getBoundaryById(boundaryId("two"))).toBeUndefined();
    expect(graph.getBoundaryContainingComponent(id("b"))).toBeUndefined();
    expect(base.getBoundaries()).toEqual([]);
  });

  it("assigns, transfers, and removes membership atomically with identity no-ops", () => {
    let graph = graphWithThreeComponents();
    graph = success(graph.addBoundary(boundary("one", "One", [id("c")])));
    graph = success(graph.addBoundary(boundary("two", "Two")));

    const assigned = success(graph.assignComponentToBoundary(id("a"), boundaryId("one")));
    expect(assigned.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([
      id("a"), id("c"),
    ]);
    expect(graph.getBoundaryContainingComponent(id("a"))).toBeUndefined();
    expect(success(assigned.assignComponentToBoundary(id("a"), boundaryId("one")))).toBe(assigned);

    const transferred = success(assigned.assignComponentToBoundary(id("a"), boundaryId("two")));
    expect(transferred.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([id("c")]);
    expect(transferred.getBoundaryById(boundaryId("two"))?.memberComponentIds).toEqual([id("a")]);
    expect(assigned.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([
      id("a"), id("c"),
    ]);

    const ungrouped = success(transferred.assignComponentToBoundary(id("a"), null));
    expect(ungrouped.getBoundaryById(boundaryId("two"))?.memberComponentIds).toEqual([]);
    expect(ungrouped.getBoundaryContainingComponent(id("a"))).toBeUndefined();
    expect(success(ungrouped.assignComponentToBoundary(id("a"), null))).toBe(ungrouped);
    expect(success(ungrouped.assignComponentToBoundary(id("b"), null))).toBe(ungrouped);
  });

  it("rejects unknown component and boundary assignment without changing membership", () => {
    const graph = success(graphWithThreeComponents().addBoundary(boundary("one", "One", [id("a")])));
    expect(graph.assignComponentToBoundary(id("missing"), boundaryId("one"))).toEqual({
      ok: false,
      error: { type: "component-id-does-not-exist", componentId: id("missing") },
    });
    expect(graph.assignComponentToBoundary(id("a"), boundaryId("missing"))).toEqual({
      ok: false,
      error: { type: "boundary-id-does-not-exist", boundaryId: boundaryId("missing") },
    });
    expect(graph.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([id("a")]);
  });

  it("renames while preserving members, and rejects blank or unknown names", () => {
    const graph = success(graphWithThreeComponents().addBoundary(boundary("one", "One", [id("a")])));
    expect(success(graph.renameBoundary(boundaryId("one"), "One"))).toBe(graph);
    expect(graph.renameBoundary(boundaryId("one"), " \t ")).toEqual({
      ok: false,
      error: { type: "boundary-name-empty", boundaryId: boundaryId("one") },
    });
    expect(graph.renameBoundary(boundaryId("missing"), "Next")).toEqual({
      ok: false,
      error: { type: "boundary-id-does-not-exist", boundaryId: boundaryId("missing") },
    });
    const renamed = success(graph.renameBoundary(boundaryId("one"), "  Next  "));
    expect(renamed.getBoundaryById(boundaryId("one"))).toEqual(
      boundary("one", "  Next  ", [id("a")]),
    );
    expect(graph.getBoundaryById(boundaryId("one"))?.name).toBe("One");
  });

  it("deletes only the boundary, leaving its components and reciprocal connections", () => {
    let graph = graphWithThreeComponents();
    graph = success(graph.addConnection(connection("forward", id("a"), id("b"))));
    graph = success(graph.addConnection(connection("backward", id("b"), id("a"))));
    graph = success(graph.addBoundary(boundary("one", "One", [id("a"), id("b")])));
    const deleted = success(graph.removeBoundary(boundaryId("one")));
    expect(deleted.getBoundaries()).toEqual([]);
    expect(deleted.getComponents()).toEqual(graph.getComponents());
    expect(deleted.getConnections()).toEqual(graph.getConnections());
    expect(graph.getBoundaryContainingComponent(id("a"))?.id).toBe(boundaryId("one"));
    expect(graph.removeBoundary(boundaryId("missing"))).toEqual({
      ok: false,
      error: { type: "boundary-id-does-not-exist", boundaryId: boundaryId("missing") },
    });
  });

  it("deletes a component, its incident connections, and only its membership", () => {
    let graph = graphWithThreeComponents();
    graph = success(graph.addConnection(connection("forward", id("a"), id("b"))));
    graph = success(graph.addConnection(connection("backward", id("b"), id("a"))));
    graph = success(graph.addBoundary(boundary("one", "One", [id("a")])));
    graph = success(graph.addBoundary(boundary("two", "Two", [id("b"), id("c")])));
    const removed = success(graph.removeComponent(id("a")));
    expect(removed.getBoundaryById(boundaryId("one"))).toEqual(boundary("one", "One"));
    expect(removed.getBoundaryById(boundaryId("two"))).toEqual(
      boundary("two", "Two", [id("b"), id("c")]),
    );
    expect(removed.getConnections()).toEqual([]);
    expect(removed.getComponents().map((value) => value.id)).toEqual([id("b"), id("c")]);
    expect(graph.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([id("a")]);
  });

  it("defensively copies submitted and exposed membership arrays", () => {
    const members = [id("b"), id("a")];
    const graph = success(graphWithThreeComponents().addBoundary(
      boundary("one", "One", members),
    ));
    members.push(id("c"));
    const returned = graph.getBoundaryById(boundaryId("one"));
    if (!returned) throw new Error("Expected boundary");
    (returned.memberComponentIds as ComponentId[]).push(id("c"));
    const listed = graph.getBoundaries();
    (listed[0].memberComponentIds as ComponentId[]).splice(0, 1);
    const byMember = graph.getBoundaryContainingComponent(id("a"));
    if (!byMember) throw new Error("Expected boundary membership");
    (byMember.memberComponentIds as ComponentId[]).push(id("c"));
    expect(graph.getBoundaryById(boundaryId("one"))?.memberComponentIds).toEqual([
      id("a"), id("b"),
    ]);
    expect(graph.getBoundaryContainingComponent(id("c"))).toBeUndefined();
  });

  it("preserves boundaries across all existing unrelated component and connection operations", () => {
    let graph = graphWithThreeComponents();
    graph = success(graph.addBoundary(boundary("one", "One", [id("a")])));
    graph = success(graph.addBoundary(boundary("two", "Two", [id("c")])));
    const original = graph.getBoundaries();
    const previous: ArchitectureGraph[] = [];

    function check(next: ArchitectureGraph): void {
      previous.push(graph);
      graph = next;
      expect(graph.getBoundaries()).toEqual(original);
      for (const oldGraph of previous) {
        expect(oldGraph.getBoundaries()).toEqual(original);
      }
    }

    check(success(graph.addComponent(component("d", "a"))));
    check(success(graph.renameComponent(id("a"), "Same visible name")));
    check(success(graph.renameComponent(id("b"), "Same visible name")));
    check(success(graph.changeComponentKind(id("b"), "client")));
    check(success(graph.addConnection(connection("forward", id("a"), id("b")))));
    check(success(graph.addConnection(connection("backward", id("b"), id("a")))));
    check(success(graph.changeConnectionKind(connectionId("forward"), "request-response")));
    check(success(graph.removeConnection(connectionId("forward"))));
    check(success(graph.removeComponent(id("d"))));
    expect(graph.getConnections().map((value) => value.id)).toEqual([connectionId("backward")]);
    expect(graph.getComponents().filter((value) => value.name === "Same visible name")).toHaveLength(2);
  });
});
