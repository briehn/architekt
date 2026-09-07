import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  addDiagramNodePosition,
  createInitialDiagramNodePositions,
  createNextDiagramNodePosition,
  type DiagramNodePositions,
  moveDiagramNode,
  removeDiagramNodePosition,
} from "./diagram-layout";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function component(id: string, name: string): ArchitectureComponent {
  return { id: componentId(id), name };
}

function addComponent(
  graph: ArchitectureGraph,
  architectureComponent: ArchitectureComponent,
): ArchitectureGraph {
  const result = graph.addComponent(architectureComponent);

  if (!result.ok) {
    throw new Error("Expected component to be added to the graph.");
  }

  return result.graph;
}

function graphWithComponents(
  ...components: ArchitectureComponent[]
): ArchitectureGraph {
  return components.reduce(addComponent, ArchitectureGraph.empty());
}

describe("createInitialDiagramNodePositions", () => {
  it("creates no positions for an empty graph", () => {
    const positions = createInitialDiagramNodePositions(
      ArchitectureGraph.empty(),
    );

    expect(positions).toEqual(new Map());
  });

  it("assigns temporary positions using the current component read order", () => {
    const graph = graphWithComponents(
      component("api", "API"),
      component("database", "Database"),
      component("cache", "Cache"),
    );
    const [first, second, third] = graph.getComponents();

    const positions = createInitialDiagramNodePositions(graph);

    expect(positions).toEqual(
      new Map([
        [first.id, { x: 0, y: 0 }],
        [second.id, { x: 240, y: 0 }],
        [third.id, { x: 480, y: 0 }],
      ]),
    );
  });
});

describe("createNextDiagramNodePosition", () => {
  it("places the first component at the origin", () => {
    expect(createNextDiagramNodePosition(new Map())).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("places a new component 240 pixels beyond the current maximum x", () => {
    const positions: DiagramNodePositions = new Map([
      [componentId("api"), { x: 420, y: 125 }],
      [componentId("database"), { x: -80, y: -40 }],
      [componentId("cache"), { x: 175, y: 300 }],
    ]);

    expect(createNextDiagramNodePosition(positions)).toEqual({
      x: 660,
      y: 0,
    });
    expect(positions).toEqual(
      new Map([
        [componentId("api"), { x: 420, y: 125 }],
        [componentId("database"), { x: -80, y: -40 }],
        [componentId("cache"), { x: 175, y: 300 }],
      ]),
    );
  });
});

describe("addDiagramNodePosition", () => {
  const apiId = componentId("api");
  const databaseId = componentId("database");

  it("inserts a position without changing the previous positions", () => {
    const draggedApiPosition = { x: 135, y: 90 };
    const previousPositions: DiagramNodePositions = new Map([
      [apiId, draggedApiPosition],
    ]);

    const nextPositions = addDiagramNodePosition(
      previousPositions,
      databaseId,
      { x: 375, y: 0 },
    );

    expect(nextPositions).not.toBe(previousPositions);
    expect(nextPositions).toEqual(
      new Map([
        [apiId, { x: 135, y: 90 }],
        [databaseId, { x: 375, y: 0 }],
      ]),
    );
    expect(nextPositions.get(apiId)).toBe(draggedApiPosition);
    expect(previousPositions).toEqual(
      new Map([[apiId, { x: 135, y: 90 }]]),
    );
  });

  it("stores new coordinates independently from the caller", () => {
    const callerOwnedPosition = { x: 240, y: 0 };

    const nextPositions = addDiagramNodePosition(
      new Map(),
      apiId,
      callerOwnedPosition,
    );
    callerOwnedPosition.x = 999;
    callerOwnedPosition.y = 999;

    expect(nextPositions.get(apiId)).toEqual({ x: 240, y: 0 });
  });

  it("does not replace an existing component position", () => {
    const existingPosition = { x: 135, y: 90 };
    const previousPositions: DiagramNodePositions = new Map([
      [apiId, existingPosition],
    ]);

    const nextPositions = addDiagramNodePosition(
      previousPositions,
      apiId,
      { x: 240, y: 0 },
    );

    expect(nextPositions).toBe(previousPositions);
    expect(nextPositions.get(apiId)).toBe(existingPosition);
  });
});

describe("removeDiagramNodePosition", () => {
  const apiId = componentId("api");
  const databaseId = componentId("database");

  it("removes a position without changing the previous positions", () => {
    const databasePosition = { x: 360, y: 80 };
    const previousPositions: DiagramNodePositions = new Map([
      [apiId, { x: 120, y: 40 }],
      [databaseId, databasePosition],
    ]);

    const nextPositions = removeDiagramNodePosition(
      previousPositions,
      apiId,
    );

    expect(nextPositions).not.toBe(previousPositions);
    expect(nextPositions).toEqual(
      new Map([[databaseId, { x: 360, y: 80 }]]),
    );
    expect(nextPositions.get(databaseId)).toBe(databasePosition);
    expect(previousPositions).toEqual(
      new Map([
        [apiId, { x: 120, y: 40 }],
        [databaseId, { x: 360, y: 80 }],
      ]),
    );
  });

  it("returns the original positions for an unknown component", () => {
    const previousPositions: DiagramNodePositions = new Map([
      [apiId, { x: 120, y: 40 }],
    ]);

    const nextPositions = removeDiagramNodePosition(
      previousPositions,
      componentId("missing"),
    );

    expect(nextPositions).toBe(previousPositions);
  });
});

describe("moveDiagramNode", () => {
  const apiId = componentId("api");
  const databaseId = componentId("database");

  function initialPositions(): DiagramNodePositions {
    return new Map([
      [apiId, { x: 0, y: 0 }],
      [databaseId, { x: 240, y: 0 }],
    ]);
  }

  it("moves one node without changing the previous positions", () => {
    const previousPositions = initialPositions();

    const nextPositions = moveDiagramNode(previousPositions, apiId, {
      x: 120,
      y: 80,
    });

    expect(nextPositions).not.toBe(previousPositions);
    expect(nextPositions).toEqual(
      new Map([
        [apiId, { x: 120, y: 80 }],
        [databaseId, { x: 240, y: 0 }],
      ]),
    );
    expect(previousPositions).toEqual(initialPositions());
  });

  it("stores coordinates independently from the caller", () => {
    const callerOwnedPosition = { x: 120, y: 80 };

    const nextPositions = moveDiagramNode(
      initialPositions(),
      apiId,
      callerOwnedPosition,
    );
    callerOwnedPosition.x = 999;
    callerOwnedPosition.y = 999;

    expect(nextPositions.get(apiId)).toEqual({ x: 120, y: 80 });
  });

  it("leaves positions unchanged for an unknown component", () => {
    const previousPositions = initialPositions();

    const nextPositions = moveDiagramNode(
      previousPositions,
      componentId("missing"),
      { x: 120, y: 80 },
    );

    expect(nextPositions).toBe(previousPositions);
  });
});
