import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";

export type DiagramPosition = Readonly<{
  x: number;
  y: number;
}>;

export type DiagramNodePositions = ReadonlyMap<ComponentId, DiagramPosition>;

export function createInitialDiagramNodePositions(
  graph: ArchitectureGraph,
): DiagramNodePositions {

  const positions = new Map<ComponentId, DiagramPosition>();

  graph.getComponents().forEach((component, index) => {
    positions.set(component.id, {
      x: index * 240,
      y: 0,
    });
  });

  return positions;
}

export function moveDiagramNode(
  currentPositions: DiagramNodePositions,
  componentId: ComponentId,
  nextPosition: DiagramPosition,
): DiagramNodePositions {

  if (!currentPositions.has(componentId)) {
    return currentPositions;
  }

  const nextPositions = new Map(currentPositions);

  nextPositions.set(componentId, {
    x: nextPosition.x,
    y: nextPosition.y,
  });

  return nextPositions;
}
