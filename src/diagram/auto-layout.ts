import {
  Graph,
  layout,
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from "@dagrejs/dagre";

import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import { deriveBoundaryRectangle } from "./boundary-geometry";
import type {
  DiagramNodePositions,
  DiagramPosition,
} from "./diagram-layout";

import {
  resolveDiagramNodeSize,
  type DiagramNodeSize,
  type DiagramNodeSizes,
} from "./diagram-node-size";

export type { DiagramNodeSize, DiagramNodeSizes } from "./diagram-node-size";

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

const RANK_SEPARATION = 160;
const NODE_SEPARATION = 64;
const DISCONNECTED_COMPONENT_SEPARATION = 96;
const OUTER_PADDING = 32;
const EDGE_SEPARATION = 32;

type LayoutRelationship = Readonly<{
  id: string;
  sourceId: string;
  targetId: string;
}>;

type LayoutBlock<Id extends string> = Readonly<{
  id: Id;
  size: DiagramNodeSize;
}>;

type IndexedConnection = Readonly<{
  connection: LayoutRelationship;
  sourceIndex: number;
  targetIndex: number;
}>;

type WeakComponent = Readonly<{
  componentIndexes: ReadonlyArray<number>;
  connections: ReadonlyArray<IndexedConnection>;
}>;

type ComponentLayout<Id extends string> = Readonly<{
  positions: ReadonlyMap<Id, DiagramPosition>;
}>;

type ComponentLayoutResult<Id extends string> =
  | { ok: true; layout: ComponentLayout<Id> }
  | { ok: false };

export function layoutArchitectureGraph(
  graph: ArchitectureGraph,
  knownNodeSizes: DiagramNodeSizes,
): AutoLayoutResult {
  const blocks = graph.getComponents().map((component) => ({
    id: component.id,
    size: resolveDiagramNodeSize(knownNodeSizes.get(component.id)),
  }));
  const relationships = graph.getConnections().map((connection) => ({
    id: connection.id,
    sourceId: connection.sourceComponentId,
    targetId: connection.targetComponentId,
  }));
  const result = layoutBlocks(blocks, relationships);
  return result.ok
    ? { ok: true, nodePositions: result.positions }
    : { ok: false, error: { type: "layout-failed" } };
}

export function layoutBoundaryAwareArchitectureGraph(
  graph: ArchitectureGraph,
  knownNodeSizes: DiagramNodeSizes,
): AutoLayoutResult {
  const boundaries = graph.getBoundaries().filter((boundary) => boundary.memberComponentIds.length > 0);
  if (boundaries.length === 0) return layoutArchitectureGraph(graph, knownNodeSizes);

  const components = graph.getComponents();
  const connections = graph.getConnections();
  const groupedComponentIds = new Set<ComponentId>();
  const localPositions = new Map<ComponentId, DiagramPosition>();
  const blocks: LayoutBlock<string>[] = [];
  const blockIdByComponentId = new Map<ComponentId, string>();

  for (const boundary of boundaries) {
    const blockId = `boundary:${boundary.id}`;
    const memberIds = new Set(boundary.memberComponentIds);
    const memberBlocks = boundary.memberComponentIds.map((id) => ({
      id,
      size: resolveDiagramNodeSize(knownNodeSizes.get(id)),
    }));
    const internalRelationships = connections
      .filter((connection) => memberIds.has(connection.sourceComponentId) && memberIds.has(connection.targetComponentId))
      .map((connection) => ({
        id: connection.id,
        sourceId: connection.sourceComponentId,
        targetId: connection.targetComponentId,
      }));
    const internal = layoutBlocks(memberBlocks, internalRelationships);
    if (!internal.ok) return { ok: false, error: { type: "layout-failed" } };

    const rectangle = deriveBoundaryRectangle(boundary, internal.positions, knownNodeSizes);
    if (!rectangle) throw new Error("A non-empty boundary has no layout rectangle.");
    blocks.push({ id: blockId, size: { width: rectangle.width, height: rectangle.height } });

    for (const memberId of boundary.memberComponentIds) {
      const position = internal.positions.get(memberId);
      if (!position) throw new Error("Auto-layout omitted a boundary member.");
      localPositions.set(memberId, {
        x: position.x - rectangle.x,
        y: position.y - rectangle.y,
      });
      groupedComponentIds.add(memberId);
      blockIdByComponentId.set(memberId, blockId);
    }
  }

  for (const component of components) {
    if (groupedComponentIds.has(component.id)) continue;
    const blockId = `component:${component.id}`;
    blocks.push({ id: blockId, size: resolveDiagramNodeSize(knownNodeSizes.get(component.id)) });
    blockIdByComponentId.set(component.id, blockId);
  }

  blocks.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const blockIndexById = new Map(blocks.map((block, index) => [block.id, index]));
  const relationshipPairs = new Map<string, LayoutRelationship>();
  for (const connection of connections) {
    const sourceId = blockIdByComponentId.get(connection.sourceComponentId);
    const targetId = blockIdByComponentId.get(connection.targetComponentId);
    if (!sourceId || !targetId) throw new Error("Auto-layout omitted a component block.");
    if (sourceId === targetId) continue;
    const sourceIndex = blockIndexById.get(sourceId);
    const targetIndex = blockIndexById.get(targetId);
    if (sourceIndex === undefined || targetIndex === undefined) throw new Error("Auto-layout omitted a block index.");
    const id = `${sourceIndex}:${targetIndex}`;
    relationshipPairs.set(id, { id, sourceId, targetId });
  }
  const outerRelationships = Array.from(relationshipPairs.values()).sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const outer = layoutBlocks(blocks, outerRelationships);
  if (!outer.ok) return { ok: false, error: { type: "layout-failed" } };

  const positions = new Map<ComponentId, DiagramPosition>();
  for (const component of components) {
    const blockId = blockIdByComponentId.get(component.id);
    const blockPosition = blockId && outer.positions.get(blockId);
    if (!blockPosition) throw new Error("Auto-layout omitted an outer block position.");
    const local = localPositions.get(component.id);
    positions.set(component.id, local ? {
      x: blockPosition.x + local.x,
      y: blockPosition.y + local.y,
    } : blockPosition);
  }
  return { ok: true, nodePositions: positions };
}

type LayoutBlocksResult<Id extends string> =
  | { ok: true; positions: ReadonlyMap<Id, DiagramPosition> }
  | { ok: false };

function layoutBlocks<Id extends string>(
  blocks: readonly LayoutBlock<Id>[],
  relationships: readonly LayoutRelationship[],
): LayoutBlocksResult<Id> {
  const blockIds = blocks.map((block) => block.id);
  if (blocks.length === 0) return { ok: true, positions: new Map() };

  const blockIndexById = new Map(blockIds.map((id, index) => [id, index]));
  const sizes = new Map(blocks.map((block) => [block.id, block.size]));
  const connections = relationships.map((connection): IndexedConnection => {
    const sourceIndex = blockIndexById.get(connection.sourceId as Id);
    const targetIndex = blockIndexById.get(connection.targetId as Id);
    if (sourceIndex === undefined || targetIndex === undefined) {
      throw new Error("Auto-layout received a relationship with an unknown block.");
    }
    return { connection, sourceIndex, targetIndex };
  }).sort(compareConnections);

  const weakComponents = findWeakComponents(blocks.length, connections);
  const packedPositions = new Map<Id, DiagramPosition>();
  let nextComponentY = 0;

  for (const weakComponent of weakComponents) {
    const componentLayoutResult = layoutWeakComponent(
      weakComponent,
      blockIds,
      sizes,
    );

    if (!componentLayoutResult.ok) {
      return { ok: false };
    }

    const normalizedComponent = normalizeComponentLayout(
      weakComponent,
      blockIds,
      sizes,
      componentLayoutResult.layout.positions,
    );

    for (const componentIndex of weakComponent.componentIndexes) {
      const componentId = blockIds[componentIndex];
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
    positions: normalizeCompleteLayout(
      blockIds,
      packedPositions,
    ),
  };
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

function layoutWeakComponent<Id extends string>(
  weakComponent: WeakComponent,
  componentIds: ReadonlyArray<Id>,
  nodeSizes: ReadonlyMap<Id, DiagramNodeSize>,
): ComponentLayoutResult<Id> {
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
        connection.sourceId,
        connection.targetId,
        {},
        connection.id,
      );
    }

    layout(dagreGraph);

    const positions = new Map<Id, DiagramPosition>();

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

function normalizeComponentLayout<Id extends string>(
  weakComponent: WeakComponent,
  componentIds: ReadonlyArray<Id>,
  nodeSizes: ReadonlyMap<Id, DiagramNodeSize>,
  positions: ReadonlyMap<Id, DiagramPosition>,
): Readonly<{
  positions: ReadonlyMap<Id, DiagramPosition>;
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

  const normalizedPositions = new Map<Id, DiagramPosition>();
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

function normalizeCompleteLayout<Id extends string>(
  componentIds: ReadonlyArray<Id>,
  positions: ReadonlyMap<Id, DiagramPosition>,
): ReadonlyMap<Id, DiagramPosition> {
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

  const normalizedPositions = new Map<Id, DiagramPosition>();

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
