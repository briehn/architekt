import type { ArchitectureEditorState } from "./architecture-editor-state";
import {
  saveLocalArchitectureEditorState,
  type SaveLocalArchitectureEditorStateResult,
  type StorageLike,
} from "../persistence/local-architecture-editor-storage";

export type PersistedEditorStateBaseline = Readonly<
  Pick<ArchitectureEditorState, "graph" | "nodePositions" | "designContext">
>;

export type PendingEditorSaveResult =
  | { status: "unchanged" }
  | { status: "saved" }
  | {
      status: "failed";
      error: Extract<SaveLocalArchitectureEditorStateResult, { ok: false }>["error"];
    };

export function savePendingArchitectureEditorState(
  storage: StorageLike | null,
  state: ArchitectureEditorState,
  baseline: PersistedEditorStateBaseline | null,
): PendingEditorSaveResult {
  if (
    baseline?.graph === state.graph &&
    baseline.nodePositions === state.nodePositions &&
    baseline.designContext === state.designContext
  ) {
    return { status: "unchanged" };
  }

  if (storage === null) {
    return { status: "failed", error: { type: "storage-unavailable" } };
  }

  const result = saveLocalArchitectureEditorState(storage, state);
  return result.ok
    ? { status: "saved" }
    : { status: "failed", error: result.error };
}
