import type { ArchitectureReviewSnapshot, ReviewEvidence } from "../application/architecture-review/architecture-review";
import type { ArchitectureReviewViewState } from "./architecture-review-controller";

const contextLabels = {
  title: "Title",
  requirementsAndConstraints: "Requirements and constraints",
  assumptionsAndOpenQuestions: "Assumptions and open questions",
  decisionsAndTradeoffs: "Decisions and tradeoffs",
} as const;

export function describeCapturedReviewEvidence(evidence: ReviewEvidence, snapshot: ArchitectureReviewSnapshot): readonly string[] {
  const componentName = (id: string) => {
    const component = snapshot.components.find((entry) => entry.id === id);
    if (!component) return id;
    return snapshot.components.some((peer) => peer.id !== id && peer.name === component.name) ? `${component.name} (${id})` : component.name;
  };
  switch (evidence.type) {
    case "component": {
      const component = snapshot.components.find((entry) => entry.id === evidence.id);
      return component ? [`${componentName(component.id)} · ${component.kind}`] : [];
    }
    case "connection": {
      const connection = snapshot.connections.find((entry) => entry.id === evidence.id);
      return connection ? [`${componentName(connection.sourceComponentId)} → ${componentName(connection.targetComponentId)} · ${connection.kind}`] : [];
    }
    case "boundary": {
      const boundary = snapshot.boundaries.find((entry) => entry.id === evidence.id);
      return boundary ? [`${boundary.name} · ${boundary.memberComponentIds.length} modeled components`, boundary.memberComponentIds.map(componentName).join(", ") || "Empty boundary"] : [];
    }
    case "analysis-finding": {
      const finding = snapshot.findingDescriptions.find((entry) => entry.key === evidence.key);
      const source = snapshot.analysis.findings.find((entry) => entry.key === evidence.key);
      if (!finding || !source) return [];
      const details = (() => {
        switch (source.ruleId) {
          case "isolated-components": return source.referencedComponentIds.map((id) => `${componentName(id)}: 0 incoming, 0 outgoing relationships`);
          case "disconnected-structure": return source.evidence.regions.map((region, index) => `Region ${index + 1}: ${region.map(componentName).join(", ")}`);
          case "directed-cyclic-region": return [
            `Region: ${source.evidence.memberComponentIds.map(componentName).join(", ")}`,
            `Example directed cycle: ${source.evidence.witness.componentIds.map(componentName).join(" → ")}`,
          ];
          case "client-database-connection": return [`${componentName(source.evidence.sourceComponentId)} → ${componentName(source.evidence.targetComponentId)} · ${source.evidence.connectionKind}`];
          case "reciprocal-request-response": return [
            `${componentName(source.evidence.firstComponentId)} → ${componentName(source.evidence.secondComponentId)} · request-response`,
            `${componentName(source.evidence.secondComponentId)} → ${componentName(source.evidence.firstComponentId)} · request-response`,
          ];
        }
      })();
      return [finding.description.message, ...(finding.description.reviewQuestion ? [finding.description.reviewQuestion] : []), ...details];
    }
    case "design-context": return [`Design Brief — ${contextLabels[evidence.field]}`, snapshot.designContext[evidence.field] || "No saved text in this field."];
  }
}

function EvidenceDisclosure({ evidence, snapshot }: Readonly<{ evidence: readonly ReviewEvidence[]; snapshot: ArchitectureReviewSnapshot }>) {
  return <details className="mt-2 text-text-secondary">
    <summary className="w-fit cursor-pointer rounded-sm text-xs font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">Evidence</summary>
    <ul className="mt-2 space-y-2 border-l border-border pl-3 text-xs">
      {evidence.map((entry, index) => <li className="break-words whitespace-pre-wrap" key={`${entry.type}-${index}`}>
        {describeCapturedReviewEvidence(entry, snapshot).map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
      </li>)}
    </ul>
  </details>;
}

type Props = Readonly<{
  state: ArchitectureReviewViewState;
  currentKey: string | null;
  unavailableReason: string | null;
  editBlocked: boolean;
  dirtyBriefBlocked: boolean;
  aiAccessEnabled: boolean;
  onReview: () => void;
  onCancel: () => void;
  onDiscard: () => void;
}>;

export function ArchitectureReviewPanel({ state, currentKey, unavailableReason, editBlocked, dirtyBriefBlocked, aiAccessEnabled, onReview, onCancel, onDiscard }: Props) {
  const completed = state.completed;
  const stale = completed !== null && completed.key !== currentKey;
  const loading = state.status === "loading";
  return <div className="min-w-0 space-y-5 text-sm text-text-primary">
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-secondary">Review is advisory and based on the modeled architecture and saved Design Brief. Deterministic Analysis remains separate.</p>
      <p className="text-xs leading-relaxed text-text-secondary">Sends the modeled architecture and saved Design Brief to OpenAI for an advisory review.</p>
      <div className="flex flex-wrap gap-2">
        <button className="design-brief-primary" disabled={!aiAccessEnabled || loading || unavailableReason !== null || editBlocked || dirtyBriefBlocked} onClick={onReview} type="button">{completed ? "Review again" : "Review architecture"}</button>
        {loading ? <button className="design-brief-secondary" onClick={onCancel} type="button">Cancel</button> : null}
        {completed && !loading ? <button className="design-brief-secondary" onClick={onDiscard} type="button">Discard review</button> : null}
      </div>
      {unavailableReason ? <p className="text-xs text-text-secondary">{unavailableReason}</p> : null}
      {editBlocked ? <p className="text-xs text-text-secondary">Finish the current canvas edit before reviewing.</p> : null}
      {dirtyBriefBlocked ? <p className="text-xs text-text-secondary">Save or Cancel your Design Brief draft before reviewing.</p> : null}
      {loading ? <p className="text-xs text-text-secondary" role="status">Reviewing architecture…</p> : null}
      {state.status === "error" ? <p className="text-xs text-danger" role="alert">{state.error.message}</p> : null}
      {state.status === "ready" ? <p className="sr-only" role="status">Grounded review ready.</p> : null}
    </div>
    {completed ? <div className="space-y-5">
      {stale ? <p className="border-l-2 border-accent pl-3 text-xs font-semibold" role="status">This review was generated from an earlier version of the architecture.</p> : null}
      <section aria-labelledby="review-modeled-facts" className="border-t border-border pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide" id="review-modeled-facts">Modeled facts</h3>
        <ul className="mt-2 space-y-3">{completed.review.modeledFacts.map((fact, index) => <li className="break-words border-t border-border/60 pt-2 first:border-0 first:pt-0" key={index}><p>{fact.text}</p><EvidenceDisclosure evidence={[fact.evidence]} snapshot={completed.snapshot} /></li>)}</ul>
      </section>
      <section aria-labelledby="review-stated-context" className="border-t border-border pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide" id="review-stated-context">Design Brief context</h3>
        {completed.review.statedContext.length ? <ul className="mt-2 space-y-3">{completed.review.statedContext.map((entry, index) => <li className="border-t border-border/60 pt-2 first:border-0 first:pt-0" key={index}><p className="text-xs font-semibold text-text-secondary">Design Brief — {contextLabels[entry.evidence.field]}</p><p className="mt-1 whitespace-pre-wrap break-words">{entry.excerpt}</p><EvidenceDisclosure evidence={[entry.evidence]} snapshot={completed.snapshot} /></li>)}</ul> : <p className="mt-2 text-xs text-text-secondary">No Design Brief excerpts selected.</p>}
      </section>
      <section aria-labelledby="review-tradeoffs" className="border-t border-border pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide" id="review-tradeoffs">Possible tradeoffs</h3>
        {completed.review.tradeoffs.length ? <ul className="mt-2 space-y-4">{completed.review.tradeoffs.map((entry, index) => <li className="border-t border-border/60 pt-2 first:border-0 first:pt-0" key={index}><p className="font-semibold">{entry.condition}</p><p className="mt-1"><span className="text-text-secondary">Possible benefit:</span> {entry.benefit}</p><p className="mt-1"><span className="text-text-secondary">Possible downside:</span> {entry.downside}</p><EvidenceDisclosure evidence={entry.evidence} snapshot={completed.snapshot} /></li>)}</ul> : <p className="mt-2 text-xs text-text-secondary">No tradeoffs selected.</p>}
      </section>
      <section aria-labelledby="review-questions" className="border-t border-border pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide" id="review-questions">Questions to resolve</h3>
        <ul className="mt-2 space-y-3">{completed.review.questions.map((entry, index) => <li className="border-t border-border/60 pt-2 first:border-0 first:pt-0" key={index}><p className="break-words">{entry.question}</p><EvidenceDisclosure evidence={entry.evidence} snapshot={completed.snapshot} /></li>)}</ul>
      </section>
    </div> : null}
  </div>;
}
