import type { ArchitectureEditorState } from "./architecture-editor-state";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import type { DiagramPosition } from "./diagram-layout";

export type BoundaryMovementStart = Readonly<{
  boundaryId: BoundaryId;
  graph: ArchitectureEditorState["graph"];
  memberPositions: ReadonlyMap<ComponentId, DiagramPosition>;
}>;

export function captureBoundaryMovement(
  state: ArchitectureEditorState,
  boundaryId: BoundaryId,
): BoundaryMovementStart | null {
  const boundary = state.graph.getBoundaryById(boundaryId);
  if (!boundary || boundary.memberComponentIds.length === 0) return null;
  const memberPositions = new Map<ComponentId, DiagramPosition>();
  for (const memberId of boundary.memberComponentIds) {
    const position = state.nodePositions.get(memberId);
    if (!position) throw new Error("Missing diagram position for boundary member.");
    memberPositions.set(memberId, position);
  }
  return { boundaryId, graph: state.graph, memberPositions };
}

export function translateBoundaryMembers(
  state: ArchitectureEditorState,
  start: BoundaryMovementStart,
  delta: DiagramPosition,
): ArchitectureEditorState {
  if (state.graph !== start.graph) return state;
  const nextPositions = new Map(state.nodePositions);
  let changed = false;
  for (const [memberId, position] of start.memberPositions) {
    const current = state.nodePositions.get(memberId);
    if (!current) return state;
    const next = { x: position.x + delta.x, y: position.y + delta.y };
    if (current.x !== next.x || current.y !== next.y) changed = true;
    nextPositions.set(memberId, next);
  }
  return changed ? { ...state, nodePositions: nextPositions } : state;
}

export function moveBoundaryBy(
  state: ArchitectureEditorState,
  boundaryId: BoundaryId,
  delta: DiagramPosition,
): ArchitectureEditorState {
  const start = captureBoundaryMovement(state, boundaryId);
  return start ? translateBoundaryMembers(state, start, delta) : state;
}
