import { REVIEW_LIMITS, reviewFailure, type ArchitectureReview, type ArchitectureReviewFailure, type ArchitectureReviewSnapshot, type ReviewEvidence } from "../application/architecture-review/architecture-review";
import { getArchitectureReviewSnapshotKey, prepareArchitectureReviewSnapshot } from "../application/architecture-review/review-snapshot";
import type { DesignContext } from "../application/design-context";
import type { ArchitectureGraph } from "../domain/architecture-graph";

export const REVIEW_CLIENT_TIMEOUT_MS = 75_000;

export type CompletedArchitectureReview = Readonly<{ review: ArchitectureReview; snapshot: ArchitectureReviewSnapshot; key: string }>;
export type ArchitectureReviewViewState =
  | Readonly<{ status: "idle"; completed: null }>
  | Readonly<{ status: "loading"; completed: CompletedArchitectureReview | null }>
  | Readonly<{ status: "ready"; completed: CompletedArchitectureReview }>
  | Readonly<{ status: "error"; completed: CompletedArchitectureReview | null; error: ArchitectureReviewFailure }>;

export type ArchitectureReviewRequest = (snapshot: ArchitectureReviewSnapshot, signal: AbortSignal) => Promise<ArchitectureReview | ArchitectureReviewFailure>;

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validEvidence(value: unknown, snapshot: ArchitectureReviewSnapshot, allowContext: boolean): value is ReviewEvidence {
  if (!record(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "component": return keys(value, ["type", "id"]) && snapshot.components.some((component) => component.id === value.id);
    case "connection": return keys(value, ["type", "id"]) && snapshot.connections.some((connection) => connection.id === value.id);
    case "boundary": return keys(value, ["type", "id"]) && snapshot.boundaries.some((boundary) => boundary.id === value.id);
    case "analysis-finding": return keys(value, ["type", "key"]) && snapshot.findingDescriptions.some((finding) => finding.key === value.key);
    case "design-context": return allowContext && keys(value, ["type", "field"]) && ["title", "requirementsAndConstraints", "assumptionsAndOpenQuestions", "decisionsAndTradeoffs"].includes(String(value.field));
    default: return false;
  }
}
function evidenceList(value: unknown, snapshot: ArchitectureReviewSnapshot, allowBlankContext: boolean): value is ReviewEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > REVIEW_LIMITS.evidence || !value.every((entry) => validEvidence(entry, snapshot, true))) return false;
  const unique = new Set(value.map((entry) => JSON.stringify(entry)));
  if (unique.size !== value.length) return false;
  return allowBlankContext || value.some((entry) => entry.type !== "design-context" || snapshot.designContext[entry.field as keyof DesignContext].trim().length > 0);
}

/** Validate the same-origin HTTP envelope before rendering any untrusted text. */
export function parseArchitectureReviewResponse(input: unknown, snapshot: ArchitectureReviewSnapshot): ArchitectureReview | null {
  if (!record(input) || !keys(input, ["review"]) || !record(input.review)) return null;
  const review = input.review;
  if (!keys(review, ["modeledFacts", "statedContext", "tradeoffs", "questions"])) return null;
  const bounded = (value: unknown, min: number, max: number): value is unknown[] => Array.isArray(value) && value.length >= min && value.length <= max;
  if (!bounded(review.modeledFacts, 1, REVIEW_LIMITS.modeledFacts) || !bounded(review.statedContext, 0, REVIEW_LIMITS.statedContext) ||
      !bounded(review.tradeoffs, 0, REVIEW_LIMITS.tradeoffs) || !bounded(review.questions, 1, REVIEW_LIMITS.questions)) return null;
  if (!review.modeledFacts.every((item) => record(item) && keys(item, ["evidence", "text"]) && validEvidence(item.evidence, snapshot, false) && text(item.text, 1000))) return null;
  if (!review.statedContext.every((item) => record(item) && keys(item, ["evidence", "excerpt"]) && validEvidence(item.evidence, snapshot, true) && item.evidence.type === "design-context" && text(item.excerpt, REVIEW_LIMITS.excerpt) && snapshot.designContext[item.evidence.field].includes(item.excerpt))) return null;
  if (!review.tradeoffs.every((item) => record(item) && keys(item, ["condition", "benefit", "downside", "evidence"]) && text(item.condition, REVIEW_LIMITS.condition) && text(item.benefit, REVIEW_LIMITS.benefit) && text(item.downside, REVIEW_LIMITS.downside) && evidenceList(item.evidence, snapshot, false))) return null;
  if (!review.questions.every((item) => record(item) && keys(item, ["question", "evidence"]) && text(item.question, REVIEW_LIMITS.question) && evidenceList(item.evidence, snapshot, true))) return null;
  return review as ArchitectureReview;
}

const failureTypes = new Set<ArchitectureReviewFailure["type"]>([
  "invalid-request", "invalid-request-origin", "empty-architecture", "review-limit-exceeded", "invalid-context", "configuration-unavailable",
  "review-timeout", "review-canceled", "review-rate-limited", "provider-unavailable", "provider-refused", "provider-incomplete", "invalid-provider-result", "review-failed",
]);

export async function requestArchitectureReview(snapshot: ArchitectureReviewSnapshot, signal: AbortSignal): Promise<ArchitectureReview | ArchitectureReviewFailure> {
  const response = await fetch("/api/architecture/review", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
    body: JSON.stringify({ version: snapshot.reviewContractVersion, graph: {
      components: snapshot.components, connections: snapshot.connections, boundaries: snapshot.boundaries,
    }, designContext: snapshot.designContext }),
  });
  // The server bounds its own response; also reject an oversized intermediary response locally.
  const raw = await response.text();
  if (raw.length > 256 * 1024) return reviewFailure("invalid-provider-result");
  let body: unknown;
  try { body = JSON.parse(raw) as unknown; }
  catch { return reviewFailure("invalid-provider-result"); }
  if (response.ok) return parseArchitectureReviewResponse(body, snapshot) ?? reviewFailure("invalid-provider-result");
  const error = record(body) && record(body.error) ? body.error : null;
  return error && typeof error.type === "string" && failureTypes.has(error.type as ArchitectureReviewFailure["type"])
    ? reviewFailure(error.type as ArchitectureReviewFailure["type"])
    : reviewFailure("review-failed");
}

function isFailure(value: ArchitectureReview | ArchitectureReviewFailure): value is ArchitectureReviewFailure { return "type" in value; }

/** Transient request lifecycle. The document is never owned or changed here. */
export class ArchitectureReviewController {
  private state: ArchitectureReviewViewState = { status: "idle", completed: null };
  private active: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;
  private epoch = 0;
  private disposed = false;
  private pendingKey: string | null = null;

  constructor(private readonly onChange: (state: ArchitectureReviewViewState) => void,
    private readonly currentKey: () => string | null,
    private readonly request: ArchitectureReviewRequest = requestArchitectureReview) {}

  getState() { return this.state; }
  private publish(state: ArchitectureReviewViewState) { if (!this.disposed) { this.state = state; this.onChange(state); } }
  private stopPending() {
    ++this.version;
    this.active?.abort(); this.active = null; this.pendingKey = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  cancel() {
    if (this.state.status !== "loading") return;
    const completed = this.state.completed;
    this.stopPending();
    this.publish(completed ? { status: "ready", completed } : { status: "idle", completed: null });
  }
  discard() {
    this.stopPending();
    this.publish({ status: "idle", completed: null });
  }
  clearForDocumentReplacement() {
    ++this.epoch;
    this.discard();
  }
  onCanonicalChange(key: string | null) {
    if (this.state.status === "loading" && key !== this.pendingKey) this.cancel();
  }
  async start(graph: ArchitectureGraph, context: DesignContext) {
    if (this.disposed) return;
    this.cancel();
    const prepared = prepareArchitectureReviewSnapshot(graph, context);
    const completed = this.state.completed;
    if (!prepared.ok) { this.publish({ status: "error", completed, error: prepared.error }); return; }
    const snapshot = prepared.snapshot;
    const key = getArchitectureReviewSnapshotKey(snapshot);
    const controller = new AbortController();
    const version = ++this.version;
    const epoch = this.epoch;
    this.active = controller; this.pendingKey = key;
    let timedOut = false;
    this.timer = setTimeout(() => { timedOut = true; controller.abort(); }, REVIEW_CLIENT_TIMEOUT_MS);
    this.publish({ status: "loading", completed });
    const stillCurrent = () => !this.disposed && version === this.version && epoch === this.epoch && this.currentKey() === key;
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Review interrupted")), { once: true });
      });
      const result = await Promise.race([this.request(snapshot, controller.signal), interrupted]);
      if (!stillCurrent()) return;
      this.active = null; this.pendingKey = null;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      if (timedOut) { this.publish({ status: "error", completed, error: reviewFailure("review-timeout") }); return; }
      if (controller.signal.aborted) return;
      this.publish(isFailure(result) ? { status: "error", completed, error: result } : { status: "ready", completed: { review: result, snapshot, key } });
    } catch {
      if (!stillCurrent()) return;
      this.active = null; this.pendingKey = null;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      if (timedOut) this.publish({ status: "error", completed, error: reviewFailure("review-timeout") });
      else if (!controller.signal.aborted) this.publish({ status: "error", completed, error: reviewFailure("review-failed") });
    }
  }
  dispose() { this.disposed = true; ++this.epoch; this.stopPending(); }
}
