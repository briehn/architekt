import type { ArchitectureEditorState } from "./architecture-editor-state";
import { recordArchitectureEditorState, type ArchitectureEditorHistory } from "./architecture-editor-history";

/** A document import replaces all canonical fields in one snapshot transition. */
export function applyPortableDocument(
  history: ArchitectureEditorHistory,
  imported: Pick<ArchitectureEditorState, "graph" | "nodePositions" | "designContext">,
): ArchitectureEditorHistory {
  return recordArchitectureEditorState(history, {
    graph: imported.graph,
    nodePositions: imported.nodePositions,
    designContext: imported.designContext,
    nodeMeasurements: new Map(),
  });
}
