import { analyzeArchitecture, describeArchitectureFinding } from "../architecture-analysis/architecture-analysis";
import { validateDesignContext } from "../design-context";
import type { DesignContext } from "../design-context";
import { isArchitectureComponentKind } from "../../domain/architecture-component";
import { isArchitectureConnectionKind } from "../../domain/architecture-connection";
import { ArchitectureGraph } from "../../domain/architecture-graph";
import { REVIEW_ANALYSIS_CONTRACT_VERSION, REVIEW_CONTRACT_VERSION, REVIEW_LIMITS, reviewFailure } from "./architecture-review";
import type { ArchitectureReviewFailure, ArchitectureReviewSnapshot } from "./architecture-review";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutableCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, immutableCopy(entry)]),
    )) as T;
  }
  return value;
}

export type PrepareReviewSnapshotResult =
  | Readonly<{ ok: true; snapshot: ArchitectureReviewSnapshot }>
  | Readonly<{ ok: false; error: ArchitectureReviewFailure }>;

/** Captures only committed review-relevant data; the graph remains authoritative. */
export function prepareArchitectureReviewSnapshot(
  graph: ArchitectureGraph,
  context: DesignContext,
): PrepareReviewSnapshotResult {
  const components = [...graph.getComponents()].sort((a, b) => compareStrings(a.id, b.id));
  if (components.length === 0) return { ok: false, error: reviewFailure("empty-architecture") };
  const connections = [...graph.getConnections()].sort((a, b) => compareStrings(a.id, b.id));
  const boundaries = [...graph.getBoundaries()].sort((a, b) => compareStrings(a.id, b.id));
  const counts = [
    ["components", components.length, REVIEW_LIMITS.components],
    ["connections", connections.length, REVIEW_LIMITS.connections],
    ["boundaries", boundaries.length, REVIEW_LIMITS.boundaries],
  ] as const;
  for (const [label, count, limit] of counts) {
    if (count > limit) return { ok: false, error: reviewFailure("review-limit-exceeded", `${label}: maximum ${limit}`) };
  }
  const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= REVIEW_LIMITS.entityId;
  const validName = (name: unknown): name is string => typeof name === "string" && name.trim().length > 0 && name.length <= REVIEW_LIMITS.name;
  if (components.some((component) => !validId(component.id) || !validName(component.name) || !isArchitectureComponentKind(component.kind))) {
    return { ok: false, error: reviewFailure("review-limit-exceeded", "component ID, name, or kind") };
  }
  if (connections.some((connection) => !validId(connection.id) || !validId(connection.sourceComponentId) || !validId(connection.targetComponentId) || !isArchitectureConnectionKind(connection.kind))) {
    return { ok: false, error: reviewFailure("review-limit-exceeded", "connection ID, endpoint, or kind") };
  }
  if (boundaries.some((boundary) => !validId(boundary.id) || !validName(boundary.name) || boundary.memberComponentIds.some((id) => !validId(id)))) {
    return { ok: false, error: reviewFailure("review-limit-exceeded", "boundary ID, name, or member ID") };
  }
  const validatedContext = validateDesignContext(context);
  if (!validatedContext.ok) return { ok: false, error: reviewFailure("invalid-context") };
  const analysis = analyzeArchitecture(graph);
  if (analysis.findings.length > REVIEW_LIMITS.findings) {
    return { ok: false, error: reviewFailure("review-limit-exceeded", `findings: maximum ${REVIEW_LIMITS.findings}`) };
  }

  const snapshot = immutableCopy({
    reviewContractVersion: REVIEW_CONTRACT_VERSION,
    analysisContractVersion: REVIEW_ANALYSIS_CONTRACT_VERSION,
    components,
    connections,
    boundaries: boundaries.map((boundary) => ({ ...boundary, memberComponentIds: [...boundary.memberComponentIds].sort(compareStrings) })),
    designContext: validatedContext.context,
    analysis: {
      summary: analysis.summary,
      componentDegrees: [...analysis.componentDegrees].sort((a, b) => compareStrings(a.componentId, b.componentId)),
      findings: [...analysis.findings].sort((a, b) => compareStrings(a.key, b.key)),
    },
    findingDescriptions: analysis.findings.map((finding) => ({
      key: finding.key,
      description: describeArchitectureFinding(finding, graph),
    })).sort((a, b) => compareStrings(a.key, b.key)),
  }) as ArchitectureReviewSnapshot;
  if (JSON.stringify(snapshot).length > REVIEW_LIMITS.snapshotCharacters) {
    return { ok: false, error: reviewFailure("review-limit-exceeded", "expanded snapshot") };
  }
  return { ok: true, snapshot };
}

/** Local-only equality key; never include it in provider input or persisted state. */
export function getArchitectureReviewSnapshotKey(snapshot: ArchitectureReviewSnapshot): string {
  return JSON.stringify(snapshot);
}

export function haveSameReviewRelevantContent(
  first: ArchitectureReviewSnapshot,
  second: ArchitectureReviewSnapshot,
): boolean {
  return getArchitectureReviewSnapshotKey(first) === getArchitectureReviewSnapshotKey(second);
}
