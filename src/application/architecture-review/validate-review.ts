import { REVIEW_LIMITS, reviewFailure } from "./architecture-review";
import type { ArchitectureReview, ArchitectureReviewFailure, ArchitectureReviewSnapshot, ReviewEvidence } from "./architecture-review";
import type { ReviewEvidenceIndex } from "./review-evidence";
import { formatModeledReviewFact } from "./review-evidence";

export type ValidateReviewResult =
  | Readonly<{ ok: true; review: ArchitectureReview }>
  | Readonly<{ ok: false; error: ArchitectureReviewFailure }>;

function recordWithKeys(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) return;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some((key) => !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], "value"))) return;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function boundedText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || value.length > limit || value.trim().length === 0) return;
  return value.trim();
}

function validArray(value: unknown, minimum: number, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length >= minimum && value.length <= maximum &&
    Object.keys(value).length === value.length && value.every((_, index) => Object.hasOwn(value, index));
}

function hasBoundedPlainTree(value: unknown, limit: number): boolean {
  const seen = new Set<object>();
  let size = 0;
  function visit(entry: unknown): boolean {
    if (entry === null || typeof entry === "boolean" || typeof entry === "number") {
      size += 8;
      return size <= limit;
    }
    if (typeof entry === "string") {
      size += entry.length + 2;
      return size <= limit;
    }
    if (typeof entry !== "object" || seen.has(entry)) return false;
    seen.add(entry);
    if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const keys = Reflect.ownKeys(entry);
    if (keys.some((key) => typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"))) return false;
    if (Array.isArray(entry) && !validArray(entry, 0, limit)) return false;
    for (const key of keys) {
      if (typeof key !== "string") return false;
      if (key === "length" && Array.isArray(entry)) continue;
      size += key.length + 4;
      if (size > limit || !visit(descriptors[key].value)) return false;
    }
    return true;
  }
  return visit(value);
}

function validEvidenceReference(evidence: ReviewEvidence, snapshot: ArchitectureReviewSnapshot): boolean {
  switch (evidence.type) {
    case "component": return snapshot.components.some(({ id }) => id === evidence.id);
    case "connection": return snapshot.connections.some(({ id }) => id === evidence.id);
    case "boundary": return snapshot.boundaries.some(({ id }) => id === evidence.id);
    case "analysis-finding": return snapshot.analysis.findings.some(({ key }) => key === evidence.key) && snapshot.findingDescriptions.some(({ key }) => key === evidence.key);
    case "design-context": return Object.hasOwn(snapshot.designContext, evidence.field);
  }
}

function resolveEvidenceList(value: unknown, index: ReviewEvidenceIndex, snapshot: ArchitectureReviewSnapshot): readonly ReviewEvidence[] | undefined {
  if (!validArray(value, 1, REVIEW_LIMITS.evidence)) return;
  const seen = new Set<string>();
  const result: ReviewEvidence[] = [];
  for (const alias of value) {
    if (typeof alias !== "string" || seen.has(alias)) return;
    seen.add(alias);
    const evidence = index.resolve(alias);
    if (!evidence || !validEvidenceReference(evidence, snapshot)) return;
    result.push(evidence);
  }
  return Object.freeze(result);
}

/** Untrusted provider output is accepted all-or-nothing. No semantic NLP judgement is attempted. */
export function validateArchitectureReviewResult(
  output: unknown,
  index: ReviewEvidenceIndex,
  snapshot: ArchitectureReviewSnapshot,
): ValidateReviewResult {
  const invalid = (): ValidateReviewResult => ({ ok: false, error: reviewFailure("invalid-provider-result") });
  if (!hasBoundedPlainTree(output, REVIEW_LIMITS.rawOutputCharacters)) return invalid();
  if (JSON.stringify(output).length > REVIEW_LIMITS.rawOutputCharacters) return invalid();
  const root = recordWithKeys(output, ["modeledFacts", "statedContext", "tradeoffs", "questions"]);
  if (!root || !validArray(root.modeledFacts, 1, REVIEW_LIMITS.modeledFacts) ||
    !validArray(root.statedContext, 0, REVIEW_LIMITS.statedContext) ||
    !validArray(root.tradeoffs, 0, REVIEW_LIMITS.tradeoffs) ||
    !validArray(root.questions, 1, REVIEW_LIMITS.questions)) return invalid();

  const modeledFacts: ArchitectureReview["modeledFacts"][number][] = [];
  const seenFacts = new Set<string>();
  for (const value of root.modeledFacts) {
    const item = recordWithKeys(value, ["type", "evidence"]);
    if (!item || item.type !== "modeled-fact" || typeof item.evidence !== "string" || seenFacts.has(item.evidence)) return invalid();
    seenFacts.add(item.evidence);
    const evidence = index.resolve(item.evidence);
    if (!evidence || evidence.type === "design-context" || !validEvidenceReference(evidence, snapshot)) return invalid();
    const text = formatModeledReviewFact(evidence, snapshot);
    if (!text) return invalid();
    modeledFacts.push(Object.freeze({ evidence, text }));
  }

  const statedContext: ArchitectureReview["statedContext"][number][] = [];
  const seenContext = new Set<string>();
  for (const value of root.statedContext) {
    const item = recordWithKeys(value, ["type", "evidence", "excerpt"]);
    if (!item || item.type !== "stated-context" || typeof item.evidence !== "string" || seenContext.has(item.evidence)) return invalid();
    seenContext.add(item.evidence);
    const evidence = index.resolve(item.evidence);
    if (!evidence || evidence.type !== "design-context" || !validEvidenceReference(evidence, snapshot) ||
      typeof item.excerpt !== "string" || item.excerpt.length > REVIEW_LIMITS.excerpt ||
      item.excerpt.trim().length === 0 || !snapshot.designContext[evidence.field].includes(item.excerpt)) return invalid();
    statedContext.push(Object.freeze({ evidence, excerpt: item.excerpt }));
  }

  const tradeoffs: ArchitectureReview["tradeoffs"][number][] = [];
  const seenTradeoffs = new Set<string>();
  for (const value of root.tradeoffs) {
    const item = recordWithKeys(value, ["type", "condition", "benefit", "downside", "evidence"]);
    if (!item || item.type !== "tradeoff") return invalid();
    const condition = boundedText(item.condition, REVIEW_LIMITS.condition);
    const benefit = boundedText(item.benefit, REVIEW_LIMITS.benefit);
    const downside = boundedText(item.downside, REVIEW_LIMITS.downside);
    const evidence = resolveEvidenceList(item.evidence, index, snapshot);
    if (!condition || !benefit || !downside || !evidence ||
      !evidence.some((source) => source.type !== "design-context" || snapshot.designContext[source.field].trim().length > 0)) return invalid();
    const signature = JSON.stringify([condition.toLowerCase(), benefit.toLowerCase(), downside.toLowerCase()]);
    if (seenTradeoffs.has(signature)) return invalid();
    seenTradeoffs.add(signature);
    tradeoffs.push(Object.freeze({ condition, benefit, downside, evidence }));
  }

  const questions: ArchitectureReview["questions"][number][] = [];
  const seenQuestions = new Set<string>();
  for (const value of root.questions) {
    const item = recordWithKeys(value, ["type", "question", "evidence"]);
    if (!item || item.type !== "question") return invalid();
    const question = boundedText(item.question, REVIEW_LIMITS.question);
    const evidence = resolveEvidenceList(item.evidence, index, snapshot);
    if (!question || !evidence || seenQuestions.has(question.toLowerCase())) return invalid();
    seenQuestions.add(question.toLowerCase());
    questions.push(Object.freeze({ question, evidence }));
  }

  return { ok: true, review: Object.freeze({
    modeledFacts: Object.freeze(modeledFacts),
    statedContext: Object.freeze(statedContext),
    tradeoffs: Object.freeze(tradeoffs),
    questions: Object.freeze(questions),
  }) };
}
