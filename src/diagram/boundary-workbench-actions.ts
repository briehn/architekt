import type { ArchitectureBoundary } from "../domain/architecture-boundary";
import type { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId } from "../domain/identifiers";
import {
  addBoundaryToEditorState,
  assignComponentToBoundaryInEditorState,
  removeBoundaryFromEditorState,
  renameBoundaryInEditorState,
} from "./architecture-editor-state";
import {
  recordArchitectureEditorState,
  type ArchitectureEditorHistory,
} from "./architecture-editor-history";

export type BoundaryEditResult =
  | { readonly ok: true; readonly history: ArchitectureEditorHistory; readonly changed: boolean }
  | { readonly ok: false; readonly message: string };

export function canEditBoundaries(
  nodeDragIsActive: boolean,
  renameIsActive: boolean,
  connectionIsPending: boolean,
): boolean {
  return !nodeDragIsActive && !renameIsActive && !connectionIsPending;
}

export function getEligibleBoundaryCreationMembers(
  graph: ArchitectureGraph,
  selectedComponentIds: ReadonlySet<ComponentId>,
): readonly ComponentId[] {
  return graph.getComponents()
    .filter((component) => selectedComponentIds.has(component.id) &&
      graph.getBoundaryContainingComponent(component.id) === undefined)
    .map((component) => component.id);
}

export function recordBoundaryCreation(
  history: ArchitectureEditorHistory,
  boundary: ArchitectureBoundary,
): BoundaryEditResult {
  const result = addBoundaryToEditorState(history.present, {
    ...boundary,
    name: boundary.name.trim(),
  });
  if (!result.ok) {
    switch (result.error.type) {
      case "boundary-name-empty": return { ok: false, message: "Enter a boundary name." };
      case "member-component-already-in-boundary": return { ok: false, message: "A selected component already belongs to another boundary. Review the member list." };
      case "member-component-id-does-not-exist": return { ok: false, message: "A selected component no longer exists. Review the member list." };
      case "duplicate-member-component-id": return { ok: false, message: "A component was selected more than once. Review the member list." };
      case "boundary-id-already-exists": return { ok: false, message: "Could not create the boundary. Try again." };
    }
  }
  const nextHistory = recordArchitectureEditorState(history, result.state);
  return { ok: true, history: nextHistory, changed: nextHistory !== history };
}

export function recordBoundaryRename(
  history: ArchitectureEditorHistory,
  boundaryId: BoundaryId,
  name: string,
): BoundaryEditResult {
  const result = renameBoundaryInEditorState(history.present, boundaryId, name.trim());
  if (!result.ok) return {
    ok: false,
    message: result.error.type === "boundary-name-empty"
      ? "Enter a boundary name."
      : "This boundary no longer exists.",
  };
  const nextHistory = recordArchitectureEditorState(history, result.state);
  return { ok: true, history: nextHistory, changed: nextHistory !== history };
}

export function recordBoundaryDeletion(
  history: ArchitectureEditorHistory,
  boundaryId: BoundaryId,
): BoundaryEditResult {
  const result = removeBoundaryFromEditorState(history.present, boundaryId);
  if (!result.ok) return { ok: false, message: "This boundary no longer exists." };
  const nextHistory = recordArchitectureEditorState(history, result.state);
  return { ok: true, history: nextHistory, changed: nextHistory !== history };
}

export function recordBoundaryMembershipChange(
  history: ArchitectureEditorHistory,
  componentId: ComponentId,
  boundaryId: BoundaryId | null,
): BoundaryEditResult {
  const result = assignComponentToBoundaryInEditorState(history.present, componentId, boundaryId);
  if (!result.ok) return {
    ok: false,
    message: result.error.type === "boundary-id-does-not-exist"
      ? "That boundary no longer exists. Choose another."
      : "This component no longer exists.",
  };
  const nextHistory = recordArchitectureEditorState(history, result.state);
  return { ok: true, history: nextHistory, changed: nextHistory !== history };
}
