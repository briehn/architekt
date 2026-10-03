import { areDesignContextsEqual, validateDesignContext, type DesignContextValidationError } from "../application/design-context";
import type { ArchitectureEditorState } from "./architecture-editor-state";

export type ReplaceDesignContextInEditorStateResult =
  | { ok: true; state: ArchitectureEditorState }
  | { ok: false; error: DesignContextValidationError };

export function replaceDesignContextInEditorState(
  state: ArchitectureEditorState,
  candidate: unknown,
): ReplaceDesignContextInEditorStateResult {
  const result = validateDesignContext(candidate);
  if (!result.ok) return result;
  if (areDesignContextsEqual(state.designContext, result.context)) {
    return { ok: true, state };
  }
  return { ok: true, state: { ...state, designContext: result.context } };
}
