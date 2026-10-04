import { hasDesignContextContent } from "../application/design-context";
import { portableExportFilename } from "../application/portable-export-filename";
import type { ArchitectureEditorState } from "../diagram/architecture-editor-state";
import { restoreArchitectureEditorState, toPersistedArchitectureEditorDocument } from "./architecture-editor-document";

// Well above a ~100-component/200-connection document plus the three 5,000-unit brief fields.
export const PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;

export type PortableDocumentPreview = Readonly<{
  title: string;
  componentCount: number;
  connectionCount: number;
  boundaryCount: number;
  hasDesignBrief: boolean;
  sourceVersion: 1 | 2 | 3 | 4 | 5;
}>;

export type ParsePortableArchitectureDocumentResult =
  | { ok: true; state: ArchitectureEditorState; preview: PortableDocumentPreview }
  | { ok: false; error: "file-too-large" | "invalid-json" | "unsupported-version" | "invalid-document" };

export function portableArchitectureFilename(title: string): string {
  return portableExportFilename(title, "json");
}

export function exportPortableArchitectureDocument(
  state: Pick<ArchitectureEditorState, "graph" | "nodePositions" | "designContext">,
): Readonly<{ filename: string; json: string }> {
  const document = toPersistedArchitectureEditorDocument(state);
  return {
    filename: portableArchitectureFilename(state.designContext.title),
    json: `${JSON.stringify(document, null, 2)}\n`,
  };
}

export function parsePortableArchitectureDocument(text: string): ParsePortableArchitectureDocumentResult {
  if (new TextEncoder().encode(text).byteLength > PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "file-too-large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  const restored = restoreArchitectureEditorState(value);
  if (!restored.ok) {
    return { ok: false, error: restored.error.type === "unsupported-schema-version" ? "unsupported-version" : "invalid-document" };
  }

  const sourceVersion = (value as { schemaVersion: PortableDocumentPreview["sourceVersion"] }).schemaVersion;
  const state = restored.state;
  return {
    ok: true,
    state,
    preview: {
      title: state.designContext.title,
      componentCount: state.graph.getComponents().length,
      connectionCount: state.graph.getConnections().length,
      boundaryCount: state.graph.getBoundaries().length,
      hasDesignBrief: hasDesignContextContent(state.designContext),
      sourceVersion,
    },
  };
}
