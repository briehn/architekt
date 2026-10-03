import type { ArchitectureProposal } from "../application/architecture-proposal";
import {
  translateArchitectureProposal,
  type ArchitectureProposalIdFactory,
} from "../application/translate-architecture-proposal";
import { layoutArchitectureGraph } from "./auto-layout";
import {
  recordArchitectureEditorState,
  type ArchitectureEditorHistory,
} from "./architecture-editor-history";

export type ApplyArchitectureProposalResult =
  | { ok: true; history: ArchitectureEditorHistory }
  | { ok: false; error: "invalid-proposal" | "layout-failed" };

/** Prepare the entire replacement before recording one canonical workspace edit. */
export function applyArchitectureProposal(
  history: ArchitectureEditorHistory,
  proposal: ArchitectureProposal,
  idFactory: ArchitectureProposalIdFactory,
): ApplyArchitectureProposalResult {
  try {
    const translated = translateArchitectureProposal(proposal, idFactory);
    if (!translated.ok) return { ok: false, error: "invalid-proposal" };

    // An empty size map makes Auto-Layout use its established 176 x 72 fallback.
    const layout = layoutArchitectureGraph(translated.graph, new Map());
    if (!layout.ok) return { ok: false, error: "layout-failed" };

    return {
      ok: true,
      history: recordArchitectureEditorState(history, {
        graph: translated.graph,
        nodePositions: layout.nodePositions,
        designContext: history.present.designContext,
        nodeMeasurements: new Map(),
      }),
    };
  } catch {
    // ID factories and layout may throw. None of the prepared data has escaped.
    return { ok: false, error: "invalid-proposal" };
  }
}
