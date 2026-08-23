import { describe, expect, it } from "vitest";

import type { ArchitectureComponent } from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  createInitialDiagramNodePositions,
  type DiagramNodePositions,
  moveDiagramNode,
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
