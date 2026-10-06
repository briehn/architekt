import type { DesignContext } from "../design-context";
import { ArchitectureGraph } from "../../domain/architecture-graph";
import { reviewFailure } from "./architecture-review";
import type { ArchitectureReviewProvider, ArchitectureReviewProviderResult, ArchitectureReviewResult } from "./architecture-review";
import { buildReviewEvidenceCatalog } from "./review-evidence";
import { prepareArchitectureReviewSnapshot } from "./review-snapshot";
import { validateArchitectureReviewResult } from "./validate-review";

/** A pure application seam: expected provider failures are typed; programming errors propagate. */
export async function reviewArchitecture(
  graph: ArchitectureGraph,
  context: DesignContext,
  provider: ArchitectureReviewProvider,
  signal: AbortSignal,
): Promise<ArchitectureReviewResult> {
  if (signal.aborted) return { ok: false, error: reviewFailure("review-canceled") };
  const prepared = prepareArchitectureReviewSnapshot(graph, context);
  if (!prepared.ok) return prepared;
  const index = buildReviewEvidenceCatalog(prepared.snapshot);
  if (signal.aborted) return { ok: false, error: reviewFailure("review-canceled") };
  let response: ArchitectureReviewProviderResult;
  try {
    response = await provider.review(index.catalog, signal);
  } catch (error) {
    if (signal.aborted) return { ok: false, error: reviewFailure("review-canceled") };
    throw error;
  }
  if (signal.aborted) return { ok: false, error: reviewFailure("review-canceled") };
  if (!response.ok) return { ok: false, error: reviewFailure(response.type) };
  const validated = validateArchitectureReviewResult(response.output, index, prepared.snapshot);
  if (!validated.ok) return validated;
  return { ok: true, review: validated.review, snapshot: prepared.snapshot };
}
