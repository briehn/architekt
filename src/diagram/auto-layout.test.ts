import { describe, expect, it } from "vitest";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  layoutArchitectureGraph,
  type DiagramNodeSize,
  type DiagramNodeSizes,
} from "./auto-layout";
import type { DiagramNodePositions } from "./diagram-layout";

const FALLBACK_SIZE: DiagramNodeSize = { width: 176, height: 72 };

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function component(
  id: string,
  kind: ArchitectureComponentKind = "service",
): ArchitectureComponent {
  return { id: componentId(id), name: id.toUpperCase(), kind };
}

function connection(
  id: string,
  sourceComponentId: string,
  targetComponentId: string,
  kind: ArchitectureConnectionKind = "generic",
): ArchitectureConnection {
  return {
    id: connectionId(id),
    sourceComponentId: componentId(sourceComponentId),
    targetComponentId: componentId(targetComponentId),
    kind,
  };
}

function graphWith(
  componentIds: ReadonlyArray<string>,
  connections: ReadonlyArray<ArchitectureConnection> = [],
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();

  for (const id of componentIds) {
    const result = graph.addComponent(component(id));

    if (!result.ok) {
      throw new Error(`Expected component ${id} to be added.`);
    }

    graph = result.graph;
  }

  for (const architectureConnection of connections) {
    const result = graph.addConnection(architectureConnection);

    if (!result.ok) {
      throw new Error(
        `Expected connection ${architectureConnection.id} to be added.`,
      );
    }

    graph = result.graph;
  }

  return graph;
}

function expectSuccessfulLayout(
  graph: ArchitectureGraph,
  knownNodeSizes: DiagramNodeSizes = new Map(),
): DiagramNodePositions {
  const result = layoutArchitectureGraph(graph, knownNodeSizes);

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected auto-layout to succeed.");
  }

  return result.nodePositions;
}

function fallbackSizesFor(graph: ArchitectureGraph): DiagramNodeSizes {
  return new Map(
    graph
      .getComponents()
      .map((architectureComponent) => [
        architectureComponent.id,
        FALLBACK_SIZE,
      ]),
  );
}

function expectCompleteNonOverlappingLayout(
  graph: ArchitectureGraph,
  positions: DiagramNodePositions,
  sizes: DiagramNodeSizes = fallbackSizesFor(graph),
): void {
  const components = graph.getComponents();

  expect(positions.size).toBe(components.length);
  expect(Array.from(positions.keys())).toEqual(
    components.map((architectureComponent) => architectureComponent.id),
  );

  for (const architectureComponent of components) {
    const position = positions.get(architectureComponent.id);

    expect(position).toBeDefined();
    expect(Number.isFinite(position?.x)).toBe(true);
    expect(Number.isFinite(position?.y)).toBe(true);
    expect(position?.x).toBeGreaterThanOrEqual(32);
    expect(position?.y).toBeGreaterThanOrEqual(32);
  }

  for (let leftIndex = 0; leftIndex < components.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < components.length;
      rightIndex += 1
    ) {
      const leftId = components[leftIndex].id;
      const rightId = components[rightIndex].id;
      const leftPosition = positions.get(leftId);
      const rightPosition = positions.get(rightId);
      const leftSize = sizes.get(leftId) ?? FALLBACK_SIZE;
      const rightSize = sizes.get(rightId) ?? FALLBACK_SIZE;

      if (!leftPosition || !rightPosition) {
        throw new Error("Expected every component to have a position.");
      }

      const overlaps =
        leftPosition.x < rightPosition.x + rightSize.width &&
        leftPosition.x + leftSize.width > rightPosition.x &&
        leftPosition.y < rightPosition.y + rightSize.height &&
        leftPosition.y + leftSize.height > rightPosition.y;

      expect(overlaps).toBe(false);
    }
  }
}

describe("layoutArchitectureGraph deterministic fixtures", () => {
  const fixtures = [
    {
      name: "empty graph",
      createGraph: () => graphWith([]),
      expected: new Map(),
    },
    {
      name: "single node",
      createGraph: () => graphWith(["api"]),
      expected: new Map([[componentId("api"), { x: 32, y: 32 }]]),
    },
    {
      name: "simple chain",
      createGraph: () =>
        graphWith(
          ["client", "api", "database"],
          [
            connection("client-api", "client", "api"),
            connection("api-database", "api", "database"),
          ],
        ),
      expected: new Map([
        [componentId("client"), { x: 32, y: 32 }],
        [componentId("api"), { x: 368, y: 32 }],
        [componentId("database"), { x: 704, y: 32 }],
      ]),
    },
    {
      name: "diamond",
      createGraph: () =>
        graphWith(
          ["source", "left", "right", "target"],
          [
            connection("source-left", "source", "left"),
            connection("source-right", "source", "right"),
            connection("left-target", "left", "target"),
            connection("right-target", "right", "target"),
          ],
        ),
      expected: new Map([
        [componentId("source"), { x: 32, y: 100 }],
        [componentId("left"), { x: 368, y: 168 }],
        [componentId("right"), { x: 368, y: 32 }],
        [componentId("target"), { x: 704, y: 100 }],
      ]),
    },
    {
      name: "disconnected graph",
      createGraph: () =>
        graphWith(
          ["source", "target", "isolated"],
          [connection("source-target", "source", "target")],
        ),
      expected: new Map([
        [componentId("source"), { x: 32, y: 32 }],
        [componentId("target"), { x: 368, y: 32 }],
        [componentId("isolated"), { x: 32, y: 200 }],
      ]),
    },
  ];

  it.each(fixtures)(
    "returns exact stable coordinates for $name",
    ({ createGraph, expected }) => {
      const graph = createGraph();
      const firstPositions = expectSuccessfulLayout(graph);
      const repeatedPositions = expectSuccessfulLayout(graph);
      const equivalentPositions = expectSuccessfulLayout(createGraph());

      expect(firstPositions).toEqual(expected);
      expect(repeatedPositions).toEqual(expected);
      expect(equivalentPositions).toEqual(expected);
      expect(repeatedPositions).not.toBe(firstPositions);
    },
  );
});

describe("layoutArchitectureGraph graph shapes", () => {
  const graphShapes = [
    {
      name: "branching tree",
      createGraph: () =>
        graphWith(
          ["root", "branch-a", "branch-b", "leaf-a", "leaf-b"],
          [
            connection("root-a", "root", "branch-a"),
            connection("root-b", "root", "branch-b"),
            connection("a-leaf", "branch-a", "leaf-a"),
            connection("b-leaf", "branch-b", "leaf-b"),
          ],
        ),
    },
    {
      name: "fan-in",
      createGraph: () =>
        graphWith(
          ["client-a", "client-b", "client-c", "api"],
          [
            connection("a-api", "client-a", "api"),
            connection("b-api", "client-b", "api"),
            connection("c-api", "client-c", "api"),
          ],
        ),
    },
    {
      name: "fan-out",
      createGraph: () =>
        graphWith(
          ["api", "worker-a", "worker-b", "worker-c"],
          [
            connection("api-a", "api", "worker-a"),
            connection("api-b", "api", "worker-b"),
            connection("api-c", "api", "worker-c"),
          ],
        ),
    },
    {
      name: "cycle",
      createGraph: () =>
        graphWith(
          ["a", "b", "c"],
          [
            connection("a-b", "a", "b"),
            connection("b-c", "b", "c"),
            connection("c-a", "c", "a"),
          ],
        ),
    },
    {
      name: "bidirectional pair",
      createGraph: () =>
        graphWith(
          ["a", "b"],
          [
            connection("a-b", "a", "b"),
            connection("b-a", "b", "a"),
          ],
        ),
    },
    {
      name: "multiple disconnected subgraphs and isolated nodes",
      createGraph: () =>
        graphWith(
          ["a", "b", "c", "d", "isolated-a", "isolated-b"],
          [
            connection("a-b", "a", "b"),
            connection("c-d", "c", "d"),
          ],
        ),
    },
    {
      name: "larger mixed graph",
      createGraph: () =>
        graphWith(
          ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
          [
            connection("a-b", "a", "b"),
            connection("a-c", "a", "c"),
            connection("b-d", "b", "d"),
            connection("c-d", "c", "d"),
            connection("d-e", "d", "e"),
            connection("e-c", "e", "c"),
            connection("f-g", "f", "g"),
            connection("f-h", "f", "h"),
            connection("g-i", "g", "i"),
            connection("h-i", "h", "i"),
          ],
        ),
    },
  ];

  it.each(graphShapes)(
    "lays out a $name without overlap and remains deterministic",
    ({ createGraph }) => {
      const graph = createGraph();
      const positions = expectSuccessfulLayout(graph);

      expectCompleteNonOverlappingLayout(graph, positions);
      expect(expectSuccessfulLayout(graph)).toEqual(positions);
      expect(expectSuccessfulLayout(createGraph())).toEqual(positions);
    },
  );

  it("packs disconnected components top-to-bottom in canonical occurrence order", () => {
    const graph = graphWith(
      ["a", "b", "c", "d", "isolated"],
      [
        connection("a-b", "a", "b"),
        connection("c-d", "c", "d"),
      ],
    );
    const positions = expectSuccessfulLayout(graph);

    const firstBottom = Math.max(
      positions.get(componentId("a"))!.y + FALLBACK_SIZE.height,
      positions.get(componentId("b"))!.y + FALLBACK_SIZE.height,
    );
    const secondTop = Math.min(
      positions.get(componentId("c"))!.y,
      positions.get(componentId("d"))!.y,
    );
    const secondBottom = Math.max(
      positions.get(componentId("c"))!.y + FALLBACK_SIZE.height,
      positions.get(componentId("d"))!.y + FALLBACK_SIZE.height,
    );

    expect(secondTop - firstBottom).toBe(96);
    expect(positions.get(componentId("isolated"))!.y - secondBottom).toBe(
      96,
    );
  });

  it("uses stable connection ordering and ignores connection semantics", () => {
    const firstGraph = graphWith(
      ["source", "left", "right", "target"],
      [
        connection("z-source-right", "source", "right", "streaming"),
        connection("a-left-target", "left", "target", "data-access"),
        connection("m-source-left", "source", "left", "async-messaging"),
        connection(
          "b-right-target",
          "right",
          "target",
          "request-response",
        ),
      ],
    );
    const secondGraph = graphWith(
      ["source", "left", "right", "target"],
      [
        connection("b-right-target", "right", "target"),
        connection("m-source-left", "source", "left"),
        connection("a-left-target", "left", "target"),
        connection("z-source-right", "source", "right"),
      ],
    );

    expect(expectSuccessfulLayout(firstGraph)).toEqual(
      expectSuccessfulLayout(secondGraph),
    );
  });
});

describe("layoutArchitectureGraph node dimensions", () => {
  const createChain = () =>
    graphWith(
      ["source", "target"],
      [connection("source-target", "source", "target")],
    );

  it("uses fallback sizes when no measurements are known", () => {
    const graph = createChain();

    expect(expectSuccessfulLayout(graph)).toEqual(
      new Map([
        [componentId("source"), { x: 32, y: 32 }],
        [componentId("target"), { x: 368, y: 32 }],
      ]),
    );
  });

  it("uses all supplied finite positive sizes without mutating them", () => {
    const graph = createChain();
    const sourceSize = { width: 220, height: 90 };
    const targetSize = { width: 140, height: 60 };
    const knownSizes: DiagramNodeSizes = new Map([
      [componentId("source"), sourceSize],
      [componentId("target"), targetSize],
    ]);
    const entriesBeforeLayout = Array.from(knownSizes.entries());
    const positions = expectSuccessfulLayout(graph, knownSizes);

    expectCompleteNonOverlappingLayout(graph, positions, knownSizes);
    expect(positions).toEqual(
      new Map([
        [componentId("source"), { x: 32, y: 32 }],
        [componentId("target"), { x: 412, y: 47 }],
      ]),
    );
    expect(Array.from(knownSizes.entries())).toEqual(entriesBeforeLayout);
    expect(knownSizes.get(componentId("source"))).toBe(sourceSize);
    expect(knownSizes.get(componentId("target"))).toBe(targetSize);
  });

  it("uses known sizes alongside deterministic fallbacks", () => {
    const graph = graphWith(
      ["source", "middle", "target"],
      [
        connection("source-middle", "source", "middle"),
        connection("middle-target", "middle", "target"),
      ],
    );
    const knownSizes: DiagramNodeSizes = new Map([
      [componentId("middle"), { width: 240, height: 96 }],
    ]);
    const resolvedSizes: DiagramNodeSizes = new Map([
      [componentId("source"), FALLBACK_SIZE],
      [componentId("middle"), { width: 240, height: 96 }],
      [componentId("target"), FALLBACK_SIZE],
    ]);
    const positions = expectSuccessfulLayout(graph, knownSizes);

    expectCompleteNonOverlappingLayout(graph, positions, resolvedSizes);
    expect(expectSuccessfulLayout(graph, knownSizes)).toEqual(positions);
  });

  it.each([
    ["zero width", { width: 0, height: 72 }],
    ["zero height", { width: 176, height: 0 }],
    ["negative width", { width: -1, height: 72 }],
    ["negative height", { width: 176, height: -1 }],
    ["NaN width", { width: Number.NaN, height: 72 }],
    ["NaN height", { width: 176, height: Number.NaN }],
    ["infinite width", { width: Number.POSITIVE_INFINITY, height: 72 }],
    ["infinite height", { width: 176, height: Number.NEGATIVE_INFINITY }],
  ] satisfies ReadonlyArray<readonly [string, DiagramNodeSize]>)(
    "uses the fallback for a size with $0",
    (_name, invalidSize) => {
      const graph = createChain();
      const fallbackPositions = expectSuccessfulLayout(graph);
      const positions = expectSuccessfulLayout(
        graph,
        new Map([[componentId("source"), invalidSize]]),
      );

      expect(positions).toEqual(fallbackPositions);
    },
  );

  it("changes deterministically when known dimensions change", () => {
    const graph = createChain();
    const firstSizes: DiagramNodeSizes = new Map([
      [componentId("source"), { width: 200, height: 80 }],
      [componentId("target"), { width: 120, height: 60 }],
    ]);
    const secondSizes: DiagramNodeSizes = new Map([
      [componentId("source"), { width: 260, height: 100 }],
      [componentId("target"), { width: 120, height: 60 }],
    ]);
    const firstPositions = expectSuccessfulLayout(graph, firstSizes);
    const secondPositions = expectSuccessfulLayout(graph, secondSizes);

    expect(secondPositions).not.toEqual(firstPositions);
    expect(expectSuccessfulLayout(graph, secondSizes)).toEqual(
      secondPositions,
    );
  });
});

describe("layoutArchitectureGraph immutability and scale", () => {
  it("does not mutate the graph or its returned component and connection data", () => {
    const graph = graphWith(
      ["source", "target"],
      [connection("source-target", "source", "target")],
    );
    const componentsBeforeLayout = graph.getComponents();
    const connectionsBeforeLayout = graph.getConnections();

    expectSuccessfulLayout(graph);

    expect(graph.getComponents()).toEqual(componentsBeforeLayout);
    expect(graph.getConnections()).toEqual(connectionsBeforeLayout);
  });

  it("lays out about 100 nodes and 200 edges without incomplete output", () => {
    const componentIds = Array.from(
      { length: 100 },
      (_unused, index) => `node-${index}`,
    );
    const connections: ArchitectureConnection[] = [];

    for (let index = 0; index < 99; index += 1) {
      connections.push(
        connection(`chain-${index}`, `node-${index}`, `node-${index + 1}`),
      );
    }

    for (let index = 0; index < 98; index += 1) {
      connections.push(
        connection(`skip-${index}`, `node-${index}`, `node-${index + 2}`),
      );
    }

    for (let index = 0; index < 3; index += 1) {
      connections.push(
        connection(`extra-${index}`, `node-${index}`, `node-${index + 3}`),
      );
    }

    expect(connections).toHaveLength(200);

    const graph = graphWith(componentIds, connections);
    const positions = expectSuccessfulLayout(graph);

    expectCompleteNonOverlappingLayout(graph, positions);
    expect(expectSuccessfulLayout(graph)).toEqual(positions);
  });
});
