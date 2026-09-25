import type { ComponentId } from "../domain/identifiers";
import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";

export type PendingPointerConnectionSource = Readonly<{
  componentId: ComponentId;
  side: DiagramAnchorSide;
}>;

export type ArchitectureConnectionIntent = Readonly<{
  sourceComponentId: ComponentId;
  targetComponentId: ComponentId;
}>;

export type PointerAnchorActivation = Readonly<{
  pendingSource: PendingPointerConnectionSource | null;
  connectionIntent: ArchitectureConnectionIntent | null;
}>;

export function activatePointerConnectionAnchor(
  pendingSource: PendingPointerConnectionSource | null,
  componentId: ComponentId,
  side: DiagramAnchorSide,
): PointerAnchorActivation {
  if (pendingSource === null || pendingSource.componentId === componentId) {
    return {
      pendingSource: { componentId, side },
      connectionIntent: null,
    };
  }

  return {
    pendingSource: null,
    connectionIntent: {
      sourceComponentId: pendingSource.componentId,
      targetComponentId: componentId,
    },
  };
}

export function shouldCancelPendingPointerConnectionOnEscape(
  pendingSource: PendingPointerConnectionSource | null,
  key: string,
  renameIsActive: boolean,
  editableTargetIsActive: boolean,
): boolean {
  return (
    pendingSource !== null &&
    key === "Escape" &&
    !renameIsActive &&
    !editableTargetIsActive
  );
}

export function clearDeletedPointerConnectionSource(
  pendingSource: PendingPointerConnectionSource | null,
  deletedComponentId: ComponentId,
): PendingPointerConnectionSource | null {
  return pendingSource?.componentId === deletedComponentId
    ? null
    : pendingSource;
}
