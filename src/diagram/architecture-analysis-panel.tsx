import { memo, useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeArchitecture,
  describeArchitectureFinding,
  getArchitectureFindingComponentName,
  type ArchitectureAnalysis,
  type ArchitectureFinding,
} from "../application/architecture-analysis/architecture-analysis";
import type { ComponentId } from "../domain/identifiers";
import { ArchitectureGraph } from "../domain/architecture-graph";
import { getConnectionKindPresentation } from "./connection-kind-presentation";

type ArchitectureAnalysisPanelProps = Readonly<{ graph: ArchitectureGraph }>;
type ArchitectureAnalysisContentProps = Readonly<{
  graph: ArchitectureGraph;
  analysis: ArchitectureAnalysis;
}>;
type ComponentLabel = (componentId: ComponentId) => string;

export function getAnalysisFindingCountAnnouncement(analysis: ArchitectureAnalysis): string {
  const reviewCount = analysis.findings.filter(
    (finding) => finding.category === "relationship-review",
  ).length;
  const structureCount = analysis.findings.length - reviewCount;
  return `Analysis updated: ${reviewCount} review ${reviewCount === 1 ? "question" : "questions"} and ${structureCount} structural ${structureCount === 1 ? "observation" : "observations"}.`;
}

function FindingEvidence({
  finding,
  componentLabel,
}: Readonly<{ finding: ArchitectureFinding; componentLabel: ComponentLabel }>) {
  switch (finding.ruleId) {
    case "isolated-components":
      return (
        <ul className="list-disc space-y-1 pl-5">
          {finding.referencedComponentIds.map((id) => (
            <li className="break-words" key={id}>{componentLabel(id)}</li>
          ))}
        </ul>
      );
    case "disconnected-structure":
      return (
        <ol className="list-decimal space-y-1 pl-5">
          {finding.evidence.regions.map((region) => (
            <li className="break-words" key={region[0]}>
              {region.map(componentLabel).join(", ")}
            </li>
          ))}
        </ol>
      );
    case "directed-cyclic-region":
      return (
        <div className="space-y-1 break-words">
          <p>Region: {finding.evidence.memberComponentIds.map(componentLabel).join(", ")}</p>
          <p>Example cycle: {finding.evidence.witness.componentIds.map(componentLabel).join(" → ")}</p>
        </div>
      );
    case "client-database-connection":
      return (
        <p className="break-words">
          {componentLabel(finding.evidence.sourceComponentId)} → {componentLabel(finding.evidence.targetComponentId)} · {getConnectionKindPresentation(finding.evidence.connectionKind).accessibleLabel}
        </p>
      );
    case "reciprocal-request-response": {
      const first = componentLabel(finding.evidence.firstComponentId);
      const second = componentLabel(finding.evidence.secondComponentId);
      return (
        <ul className="list-disc space-y-1 pl-5">
          <li className="break-words">{first} → {second} · Request/response</li>
          <li className="break-words">{second} → {first} · Request/response</li>
        </ul>
      );
    }
  }
}

function FindingList({
  findings,
  graph,
  componentLabel,
}: Readonly<{
  findings: readonly ArchitectureFinding[];
  graph: ArchitectureGraph;
  componentLabel: ComponentLabel;
}>) {
  return (
    <ul className="mt-2 space-y-2">
      {findings.map((finding) => {
        const description = describeArchitectureFinding(finding, graph);
        return (
          <li className="min-w-0 border-t border-border pt-2 text-sm text-text-primary first:border-0 first:pt-0" key={finding.key}>
            <p className="break-words">{description.message}</p>
            {description.reviewQuestion ? (
              <p className="mt-1 break-words text-text-secondary">
                <span className="font-semibold">Review question:</span> {description.reviewQuestion}
              </p>
            ) : null}
            <details className="mt-1 text-text-secondary">
              <summary
                aria-label={`Evidence for ${description.message}`}
                className="w-fit cursor-pointer rounded-sm text-xs font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Evidence
              </summary>
              <div className="mt-2 pl-1">
                <FindingEvidence componentLabel={componentLabel} finding={finding} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** The content is separate so graph-driven rendering can be tested without browser state. */
export const ArchitectureAnalysisContent = memo(function ArchitectureAnalysisContent({
  graph,
  analysis,
}: ArchitectureAnalysisContentProps) {
  const components = graph.getComponents();
  const componentLabel: ComponentLabel = (id) =>
    getArchitectureFindingComponentName(id, components);
  const reviews = analysis.findings.filter(
    (finding) => finding.category === "relationship-review",
  );
  const structure = analysis.findings.filter(
    (finding) => finding.category === "structure",
  );

  return (
    <div className="mt-3 max-h-[min(42vh,26rem)] min-w-0 overflow-y-auto rounded-lg border border-border bg-surface-subtle p-3">
      <section aria-labelledby="analysis-summary-heading">
        <h2 className="text-sm font-semibold text-text-primary" id="analysis-summary-heading">Summary</h2>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="text-text-secondary">Components</dt><dd className="font-semibold text-text-primary">{analysis.summary.componentCount}</dd></div>
          <div className="flex gap-1"><dt className="text-text-secondary">Connections</dt><dd className="font-semibold text-text-primary">{analysis.summary.connectionCount}</dd></div>
          <div className="flex gap-1"><dt className="text-text-secondary">Disconnected regions</dt><dd className="font-semibold text-text-primary">{analysis.summary.weaklyConnectedRegionCount > 1 ? analysis.summary.weaklyConnectedRegionCount : 0}</dd></div>
          <div className="flex gap-1"><dt className="text-text-secondary">Reciprocal pairs</dt><dd className="font-semibold text-text-primary">{analysis.summary.reciprocalPairCount}</dd></div>
        </dl>
      </section>

      <p className="mt-3 max-w-[75ch] text-xs text-text-secondary">
        Analysis describes what is modeled in this diagram. It does not establish runtime behavior, security, scalability, or correctness.
      </p>

      {analysis.summary.componentCount === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">Add components to make analysis useful.</p>
      ) : (
        <>
          {analysis.findings.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">No observations or review questions from the current checks.</p>
          ) : null}

          <section aria-labelledby="analysis-review-heading" className="mt-4">
            <h2 className="text-sm font-semibold text-text-primary" id="analysis-review-heading">Review questions</h2>
            {reviews.length > 0 ? (
              <FindingList componentLabel={componentLabel} findings={reviews} graph={graph} />
            ) : analysis.findings.length > 0 ? (
              <p className="mt-1 text-sm text-text-muted">None from the current checks.</p>
            ) : null}
          </section>

          <section aria-labelledby="analysis-structure-heading" className="mt-4">
            <h2 className="text-sm font-semibold text-text-primary" id="analysis-structure-heading">Structure</h2>
            {structure.length > 0 ? (
              <FindingList componentLabel={componentLabel} findings={structure} graph={graph} />
            ) : analysis.findings.length > 0 ? (
              <p className="mt-1 text-sm text-text-muted">None from the current checks.</p>
            ) : null}
          </section>

          <details className="mt-4 border-t border-border pt-3">
            <summary className="w-fit cursor-pointer rounded-sm text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
              Connection counts
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              {analysis.componentDegrees.map(({ componentId, incoming, outgoing }) => (
                <li className="break-words" key={componentId}>
                  <span className="font-semibold text-text-primary">{componentLabel(componentId)}</span>: {incoming} incoming, {outgoing} outgoing relationships
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
});

export function ArchitectureAnalysisPanel({ graph }: ArchitectureAnalysisPanelProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const previousFindingCountRef = useRef<number | null>(null);
  const analysis = useMemo(() => (open ? analyzeArchitecture(graph) : null), [graph, open]);

  useEffect(() => {
    if (!open || analysis === null) return;
    const count = analysis.findings.length;
    if (previousFindingCountRef.current !== null && previousFindingCountRef.current !== count) {
      setAnnouncement(getAnalysisFindingCountAnnouncement(analysis));
    }
    previousFindingCountRef.current = count;
  }, [analysis, open]);

  return (
    <details
      className="min-w-0 border-t border-border pt-3"
      onToggle={(event) => {
        if (event.currentTarget !== event.target) return;
        previousFindingCountRef.current = null;
        setAnnouncement("");
        setOpen(event.currentTarget.open);
      }}
      open={open}
    >
      <summary className="w-fit cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        Analysis
      </summary>
      <span aria-live="polite" className="sr-only" role="status">
        {open ? announcement : ""}
      </span>
      {open && analysis !== null ? (
        <ArchitectureAnalysisContent analysis={analysis} graph={graph} />
      ) : null}
    </details>
  );
}
