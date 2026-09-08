import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";
import {
  restoreArchitectureEditorState,
  toPersistedArchitectureEditorDocument,
} from "./architecture-editor-document";

const ARCHITECTURE_EDITOR_STORAGE_KEY =
  "architekt:architecture-editor";

export type StorageLike = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export type LoadLocalArchitectureEditorStateResult =
  | { status: "missing" }
  | { status: "loaded"; state: ArchitectureEditorState }
  | {
      status: "failed";
      error:
        | { type: "storage-unavailable" }
        | { type: "saved-state-invalid" }
        | {
            type: "unsupported-schema-version";
            schemaVersion: unknown;
          };
    };

export type SaveLocalArchitectureEditorStateResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | { type: "storage-unavailable" }
        | { type: "editor-state-invalid" };
    };

export type ClearLocalArchitectureEditorStateResult =
  | { ok: true }
  | {
      ok: false;
      error: { type: "storage-unavailable" };
    };

export function loadLocalArchitectureEditorState(
  storage: StorageLike,
): LoadLocalArchitectureEditorStateResult {
  let serializedDocument: string | null;

  try {
    serializedDocument = storage.getItem(ARCHITECTURE_EDITOR_STORAGE_KEY);
  } catch {
    return {
      status: "failed",
      error: { type: "storage-unavailable" },
    };
  }

  if (serializedDocument === null) {
    return { status: "missing" };
  }

  let parsedDocument: unknown;

  try {
    parsedDocument = JSON.parse(serializedDocument) as unknown;
  } catch {
    return {
      status: "failed",
      error: { type: "saved-state-invalid" },
    };
  }

  const restoreResult = restoreArchitectureEditorState(parsedDocument);

  if (!restoreResult.ok) {
    if (restoreResult.error.type === "unsupported-schema-version") {
      return {
        status: "failed",
        error: restoreResult.error,
      };
    }

    return {
      status: "failed",
      error: { type: "saved-state-invalid" },
    };
  }

  return { status: "loaded", state: restoreResult.state };
}

export function saveLocalArchitectureEditorState(
  storage: StorageLike,
  state: ArchitectureEditorState,
): SaveLocalArchitectureEditorStateResult {
  let serializedDocument: string;

  try {
    const document = toPersistedArchitectureEditorDocument(state);
    serializedDocument = JSON.stringify(document);
  } catch {
    return {
      ok: false,
      error: { type: "editor-state-invalid" },
    };
  }

  try {
    storage.setItem(
      ARCHITECTURE_EDITOR_STORAGE_KEY,
      serializedDocument,
    );
  } catch {
    return {
      ok: false,
      error: { type: "storage-unavailable" },
    };
  }

  return { ok: true };
}

export function clearLocalArchitectureEditorState(
  storage: StorageLike,
): ClearLocalArchitectureEditorStateResult {
  try {
    storage.removeItem(ARCHITECTURE_EDITOR_STORAGE_KEY);
  } catch {
    return {
      ok: false,
      error: { type: "storage-unavailable" },
    };
  }

  return { ok: true };
}
