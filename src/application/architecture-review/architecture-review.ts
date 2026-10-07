import type { ArchitectureAnalysis, ArchitectureFinding, ArchitectureFindingDescription } from "../architecture-analysis/architecture-analysis";
import type { DesignContext, DesignContextField } from "../design-context";
import type { ArchitectureBoundary } from "../../domain/architecture-boundary";
import type { ArchitectureComponent } from "../../domain/architecture-component";
import type { ArchitectureConnection } from "../../domain/architecture-connection";
import type { BoundaryId, ComponentId, ConnectionId } from "../../domain/identifiers";

export const REVIEW_CONTRACT_VERSION = 1;
export const REVIEW_ANALYSIS_CONTRACT_VERSION = 1;

export const REVIEW_LIMITS = Object.freeze({
  components: 100,
  connections: 200,
  boundaries: 100,
  findings: 400,
  entityId: 128,
  name: 200,
  snapshotCharacters: 256 * 1024,
  rawOutputCharacters: 64 * 1024,
  modeledFacts: 5,
  statedContext: 3,
  tradeoffs: 4,
  questions: 5,
  excerpt: 400,
  condition: 200,
  benefit: 240,
  downside: 240,
  question: 300,
  evidence: 6,
} as const);

export type ReviewEvidence =
  | Readonly<{ type: "component"; id: ComponentId }>
  | Readonly<{ type: "connection"; id: ConnectionId }>
  | Readonly<{ type: "boundary"; id: BoundaryId }>
  | Readonly<{ type: "analysis-finding"; key: ArchitectureFinding["key"] }>
  | Readonly<{ type: "design-context"; field: DesignContextField }>;

export type ArchitectureReview = Readonly<{
  modeledFacts: readonly Readonly<{ evidence: Exclude<ReviewEvidence, { type: "design-context" }>; text: string }>[];
  statedContext: readonly Readonly<{ evidence: Extract<ReviewEvidence, { type: "design-context" }>; excerpt: string }>[];
  tradeoffs: readonly Readonly<{ condition: string; benefit: string; downside: string; evidence: readonly ReviewEvidence[] }>[];
  questions: readonly Readonly<{ question: string; evidence: readonly ReviewEvidence[] }>[];
}>;

export type ArchitectureReviewSnapshot = Readonly<{
  reviewContractVersion: typeof REVIEW_CONTRACT_VERSION;
  analysisContractVersion: typeof REVIEW_ANALYSIS_CONTRACT_VERSION;
  components: readonly Readonly<ArchitectureComponent>[];
  connections: readonly Readonly<ArchitectureConnection>[];
  boundaries: readonly ArchitectureBoundary[];
  designContext: DesignContext;
  analysis: ArchitectureAnalysis;
  findingDescriptions: readonly Readonly<{ key: string; description: ArchitectureFindingDescription }>[];
}>;

export type ReviewCatalogEntry = Readonly<{
  alias: string;
  category: ReviewEvidence["type"];
  description: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type ReviewEvidenceCatalog = Readonly<{
  reviewContractVersion: typeof REVIEW_CONTRACT_VERSION;
  analysisContractVersion: typeof REVIEW_ANALYSIS_CONTRACT_VERSION;
  summary: ArchitectureAnalysis["summary"];
  entries: readonly ReviewCatalogEntry[];
}>;

export type RawArchitectureReview = Readonly<{
  modeledFacts: readonly Readonly<{ type: "modeled-fact"; evidence: string }>[];
  statedContext: readonly Readonly<{ type: "stated-context"; evidence: string; excerpt: string }>[];
  tradeoffs: readonly Readonly<{ type: "tradeoff"; condition: string; benefit: string; downside: string; evidence: readonly string[] }>[];
  questions: readonly Readonly<{ type: "question"; question: string; evidence: readonly string[] }>[];
}>;

export type ArchitectureReviewFailure = Readonly<{
  type: "invalid-request" | "invalid-request-origin" | "empty-architecture" | "review-limit-exceeded" |
    "invalid-context" | "configuration-unavailable" | "review-timeout" | "review-canceled" |
    "review-rate-limited" | "provider-unavailable" | "provider-refused" | "provider-incomplete" |
    "invalid-provider-result" | "review-failed";
  message: string;
  detail?: string;
}>;

export type ArchitectureReviewResult =
  | Readonly<{ ok: true; review: ArchitectureReview; snapshot: ArchitectureReviewSnapshot }>
  | Readonly<{ ok: false; error: ArchitectureReviewFailure }>;

export type ArchitectureReviewProviderResult =
  | Readonly<{ ok: true; output: unknown }>
  | Readonly<{ ok: false; type: "configuration-unavailable" | "review-timeout" | "review-canceled" |
    "review-rate-limited" | "provider-unavailable" | "provider-refused" | "provider-incomplete" |
    "invalid-provider-result" | "review-failed" }>;

export interface ArchitectureReviewProvider {
  review(catalog: ReviewEvidenceCatalog, signal: AbortSignal): Promise<ArchitectureReviewProviderResult>;
}

export const REVIEW_CONTEXT_FIELDS: readonly DesignContextField[] = Object.freeze([
  "title", "requirementsAndConstraints", "assumptionsAndOpenQuestions", "decisionsAndTradeoffs",
]);

export function reviewFailure(type: ArchitectureReviewFailure["type"], detail?: string): ArchitectureReviewFailure {
  const messages: Record<ArchitectureReviewFailure["type"], string> = {
    "invalid-request": "This review request is invalid.",
    "invalid-request-origin": "This review request is not allowed.",
    "empty-architecture": "Add at least one component to review this architecture.",
    "review-limit-exceeded": "This architecture exceeds a review limit.",
    "invalid-context": "The committed Design Brief could not be reviewed.",
    "configuration-unavailable": "Review is not configured. Contact the application owner.",
    "review-timeout": "Review took too long. Please try again.",
    "review-rate-limited": "Review is busy. Please try again later.",
    "invalid-provider-result": "The review response could not be used. Please try again.",
    "provider-unavailable": "Review is temporarily unavailable. Please try again later.",
    "provider-refused": "The review could not be provided for this architecture.",
    "provider-incomplete": "The review was incomplete. Please try again.",
    "review-failed": "Review failed. Please try again later.",
    "review-canceled": "Review was canceled.",
  };
  return { type, message: messages[type], ...(detail === undefined ? {} : { detail }) };
}
