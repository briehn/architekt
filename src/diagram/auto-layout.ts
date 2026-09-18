import {
  Graph,
  layout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from "@dagrejs/dagre";

import type { ArchitectureConnection } from "../domain/architecture-connection";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import type {
  DiagramNodePositions,
  DiagramPosition,
} from "./diagram-layout";

export type DiagramNodeSize = Readonly<{
  width: number;
  height: number;
}>;

export type DiagramNodeSizes = ReadonlyMap<ComponentId, DiagramNodeSize>;

export type AutoLayoutResult =
  | {
      ok: true;
      nodePositions: DiagramNodePositions;
    }
  | {
      ok: false;
      error: {
        type: "layout-failed";
      };
    };

const FALLBACK_NODE_SIZE: DiagramNodeSize = {
  width: 176,
  height: 72,
};

const RANK_SEPARATION = 160;
const NODE_SEPARATION = 64;
const DISCONNECTED_COMPONENT_SEPARATION = 96;
const OUTER_PADDING = 32;
const EDGE_SEPARATION = 32;

type IndexedConnection = Readonly<{
  connection: Readonly<ArchitectureConnection>;
  sourceIndex: number;
  targetIndex: number;
}>;

type WeakComponent = Readonly<{
  componentIndexes: ReadonlyArray<number>;
  connections: ReadonlyArray<IndexedConnection>;
}>;

type ComponentLayout = Readonly<{
  positions: ReadonlyMap<ComponentId, DiagramPosition>;
}>;

type ComponentLayoutResult =
  | { ok: true; layout: ComponentLayout }
  | { ok: false };

export function layoutArchitectureGraph(
  graph: ArchitectureGraph,
  knownNodeSizes: DiagramNodeSizes,
): AutoLayoutResult {
  const components = graph.getComponents();
  const componentIds = components.map((component) => component.id);

  if (components.length === 0) {
    return {
      ok: true,
      nodePositions: new Map<ComponentId, DiagramPosition>(),
    };
  }

  const componentIndexById = new Map<ComponentId, number>();
  const resolvedNodeSizes = new Map<ComponentId, DiagramNodeSize>();

  components.forEach((component, index) => {
    componentIndexById.set(component.id, index);
    resolvedNodeSizes.set(
      component.id,
      resolveNodeSize(knownNodeSizes.get(component.id)),
    );
  });

  const connections = graph
    .getConnections()
    .map((connection): IndexedConnection => {
      const sourceIndex = componentIndexById.get(
        connection.sourceComponentId,
      );
      const targetIndex = componentIndexById.get(
        connection.targetComponentId,
      );

      if (sourceIndex === undefined || targetIndex === undefined) {
        throw new Error(
          "ArchitectureGraph returned a connection with an unknown component.",
        );
      }

      return {
        connection,
        sourceIndex,
        targetIndex,
      };
    })
    .sort(compareConnections);

  const weakComponents = findWeakComponents(
    components.length,
    connections,
  );
  const packedPositions = new Map<ComponentId, DiagramPosition>();
  let nextComponentY = 0;

  for (const weakComponent of weakComponents) {
    const componentLayoutResult = layoutWeakComponent(
      weakComponent,
      componentIds,
      resolvedNodeSizes,
    );

    if (!componentLayoutResult.ok) {
      return {
        ok: false,
        error: { type: "layout-failed" },
      };
    }

    const normalizedComponent = normalizeComponentLayout(
      weakComponent,
      componentIds,
      resolvedNodeSizes,
      componentLayoutResult.layout.positions,
    );

    for (const componentIndex of weakComponent.componentIndexes) {
      const componentId = components[componentIndex].id;
      const position = normalizedComponent.positions.get(componentId);

      if (!position) {
        throw new Error("Auto-layout omitted a component position.");
      }

      packedPositions.set(componentId, {
        x: position.x,
        y: position.y + nextComponentY,
      });
    }

    nextComponentY = Math.ceil(
      nextComponentY +
        normalizedComponent.height +
        DISCONNECTED_COMPONENT_SEPARATION,
    );
  }

  return {
    ok: true,
    nodePositions: normalizeCompleteLayout(
      componentIds,
      packedPositions,
    ),
  };
}

function resolveNodeSize(
  knownNodeSize: DiagramNodeSize | undefined,
): DiagramNodeSize {
  if (
    knownNodeSize &&
    Number.isFinite(knownNodeSize.width) &&
    Number.isFinite(knownNodeSize.height) &&
    knownNodeSize.width > 0 &&
    knownNodeSize.height > 0
  ) {
    return {
      width: knownNodeSize.width,
      height: knownNodeSize.height,
    };
  }

  return FALLBACK_NODE_SIZE;
}

function compareConnections(
  left: IndexedConnection,
  right: IndexedConnection,
): number {
  if (left.sourceIndex !== right.sourceIndex) {
    return left.sourceIndex - right.sourceIndex;
  }

  if (left.targetIndex !== right.targetIndex) {
    return left.targetIndex - right.targetIndex;
  }

  if (left.connection.id < right.connection.id) {
    return -1;
  }

  if (left.connection.id > right.connection.id) {
    return 1;
  }

  return 0;
}

function findWeakComponents(
  componentCount: number,
  connections: ReadonlyArray<IndexedConnection>,
): ReadonlyArray<WeakComponent> {
  const adjacentIndexes = Array.from(
    { length: componentCount },
    () => new Set<number>(),
  );

  for (const { sourceIndex, targetIndex } of connections) {
    adjacentIndexes[sourceIndex].add(targetIndex);
    adjacentIndexes[targetIndex].add(sourceIndex);
  }

  const visited = new Set<number>();
  const weakComponentIndexes: number[][] = [];

  for (let firstIndex = 0; firstIndex < componentCount; firstIndex += 1) {
    if (visited.has(firstIndex)) {
      continue;
    }

    const componentIndexes: number[] = [];
    const indexesToVisit = [firstIndex];
    visited.add(firstIndex);

    for (let cursor = 0; cursor < indexesToVisit.length; cursor += 1) {
      const currentIndex = indexesToVisit[cursor];
      componentIndexes.push(currentIndex);

      const sortedAdjacentIndexes = Array.from(
        adjacentIndexes[currentIndex],
      ).sort((left, right) => left - right);

      for (const adjacentIndex of sortedAdjacentIndexes) {
        if (!visited.has(adjacentIndex)) {
          visited.add(adjacentIndex);
          indexesToVisit.push(adjacentIndex);
        }
      }
    }

    componentIndexes.sort((left, right) => left - right);
    weakComponentIndexes.push(componentIndexes);
  }

  return weakComponentIndexes.map((componentIndexes) => {
    const includedIndexes = new Set(componentIndexes);

    return {
      componentIndexes,
      connections: connections.filter(
        ({ sourceIndex, targetIndex }) =>
          includedIndexes.has(sourceIndex) &&
          includedIndexes.has(targetIndex),
      ),
    };
  });
}

function layoutWeakComponent(
  weakComponent: WeakComponent,
  componentIds: ReadonlyArray<ComponentId>,
  nodeSizes: ReadonlyMap<ComponentId, DiagramNodeSize>,
): ComponentLayoutResult {
  const nodes = weakComponent.componentIndexes.map((componentIndex) => {
    const componentId = componentIds[componentIndex];
    const nodeSize = nodeSizes.get(componentId);

    if (!nodeSize) {
      throw new Error("Auto-layout could not resolve a component size.");
    }

    return { componentId, nodeSize };
  });

  try {
    const dagreGraph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({
      directed: true,
      multigraph: true,
      compound: false,
    });

    dagreGraph.setGraph({
      rankdir: "LR",
      ranksep: RANK_SEPARATION,
      nodesep: NODE_SEPARATION,
      edgesep: EDGE_SEPARATION,
      marginx: 0,
      marginy: 0,
      acyclicer: "greedy",
    });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    for (const { componentId, nodeSize } of nodes) {
      dagreGraph.setNode(componentId, {
        width: nodeSize.width,
        height: nodeSize.height,
      });
    }

    for (const { connection } of weakComponent.connections) {
      dagreGraph.setEdge(
        connection.sourceComponentId,
        connection.targetComponentId,
        {},
        connection.id,
      );
    }

    layout(dagreGraph);

    const positions = new Map<ComponentId, DiagramPosition>();

    for (const { componentId, nodeSize } of nodes) {
      const dagreNode = dagreGraph.node(componentId);
      const centerX = dagreNode?.x;
      const centerY = dagreNode?.y;

      if (
        typeof centerX !== "number" ||
        typeof centerY !== "number" ||
        !Number.isFinite(centerX) ||
        !Number.isFinite(centerY)
      ) {
        throw new Error("Dagre returned an invalid component position.");
      }

      positions.set(componentId, {
        x: centerX - nodeSize.width / 2,
        y: centerY - nodeSize.height / 2,
      });
    }

    return { ok: true, layout: { positions } };
  } catch {
    return { ok: false };
  }
}

function normalizeComponentLayout(
  weakComponent: WeakComponent,
  componentIds: ReadonlyArray<ComponentId>,
  nodeSizes: ReadonlyMap<ComponentId, DiagramNodeSize>,
  positions: ReadonlyMap<ComponentId, DiagramPosition>,
): Readonly<{
  positions: ReadonlyMap<ComponentId, DiagramPosition>;
  height: number;
}> {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;

  for (const componentIndex of weakComponent.componentIndexes) {
    const position = positions.get(componentIds[componentIndex]);

    if (!position) {
      throw new Error("Auto-layout omitted a component position.");
    }

    minimumX = Math.min(minimumX, position.x);
    minimumY = Math.min(minimumY, position.y);
  }

  const normalizedPositions = new Map<ComponentId, DiagramPosition>();
  let maximumBottom = 0;

  for (const componentIndex of weakComponent.componentIndexes) {
    const componentId = componentIds[componentIndex];
    const position = positions.get(componentId);
    const nodeSize = nodeSizes.get(componentId);

    if (!position || !nodeSize) {
      throw new Error("Auto-layout omitted component layout data.");
    }

    const normalizedPosition = {
      x: position.x - minimumX,
      y: position.y - minimumY,
    };

    normalizedPositions.set(componentId, normalizedPosition);
    maximumBottom = Math.max(
      maximumBottom,
      Math.round(normalizedPosition.y) + nodeSize.height,
    );
  }

  return {
    positions: normalizedPositions,
    height: maximumBottom,
  };
}

function normalizeCompleteLayout(
  componentIds: ReadonlyArray<ComponentId>,
  positions: ReadonlyMap<ComponentId, DiagramPosition>,
): DiagramNodePositions {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;

  for (const componentId of componentIds) {
    const position = positions.get(componentId);

    if (!position) {
      throw new Error("Auto-layout omitted a component position.");
    }

    minimumX = Math.min(minimumX, position.x);
    minimumY = Math.min(minimumY, position.y);
  }

  const normalizedPositions = new Map<ComponentId, DiagramPosition>();

  for (const componentId of componentIds) {
    const position = positions.get(componentId);

    if (!position) {
      throw new Error("Auto-layout omitted a component position.");
    }

    normalizedPositions.set(componentId, {
      x: Math.round(position.x - minimumX + OUTER_PADDING),
      y: Math.round(position.y - minimumY + OUTER_PADDING),
    });
  }

  return normalizedPositions;
}
