import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { prepareArchitectureReviewSnapshot, getArchitectureReviewSnapshotKey } from "../application/architecture-review/review-snapshot";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import { ArchitectureReviewPanel, describeCapturedReviewEvidence } from "./architecture-review-panel";

const a = "a" as ComponentId; const b = "b" as ComponentId;
let graph = ArchitectureGraph.empty();
for (const component of [
  { id: a, name: "API <gateway>", kind: "service" as const },
  { id: b, name: "API <gateway>", kind: "database" as const },
]) {
  const result = graph.addComponent(component); if (!result.ok) throw Error("fixture"); graph = result.graph;
}
const connection = graph.addConnection({ id: "e" as ConnectionId, sourceComponentId: a, targetComponentId: b, kind: "data-access" });
if (!connection.ok) throw Error("fixture"); graph = connection.graph;
const boundary = graph.addBoundary({ id: "z" as BoundaryId, name: "Core", memberComponentIds: [a, b] });
if (!boundary.ok) throw Error("fixture"); graph = boundary.graph;
const context = { ...EMPTY_DESIGN_CONTEXT, requirementsAndConstraints: "Serve <users>\n世界" };
const prepared = prepareArchitectureReviewSnapshot(graph, context);
if (!prepared.ok) throw Error("fixture");
const snapshot = prepared.snapshot;

describe("captured review evidence presentation", () => {
  it("uses captured entities and safe plain text for all evidence kinds", () => {
    expect(describeCapturedReviewEvidence({ type: "component", id: a }, snapshot)).toEqual(["API <gateway> (a) · service"]);
    expect(describeCapturedReviewEvidence({ type: "connection", id: "e" as ConnectionId }, snapshot)).toEqual(["API <gateway> (a) → API <gateway> (b) · data-access"]);
    expect(describeCapturedReviewEvidence({ type: "boundary", id: "z" as BoundaryId }, snapshot)).toEqual(["Core · 2 modeled components", "API <gateway> (a), API <gateway> (b)"]);
    expect(describeCapturedReviewEvidence({ type: "design-context", field: "requirementsAndConstraints" }, snapshot)).toEqual(["Design Brief — Requirements and constraints", "Serve <users>\n世界"]);
    for (const finding of snapshot.analysis.findings) expect(describeCapturedReviewEvidence({ type: "analysis-finding", key: finding.key }, snapshot)[0]).toBeTruthy();
  });

  it("renders four sections, conditional tradeoffs, stale status, and native disclosures", () => {
    const html = renderToStaticMarkup(<ArchitectureReviewPanel
      state={{ status: "ready", completed: { key: getArchitectureReviewSnapshotKey(snapshot), snapshot, review: {
        modeledFacts: [{ evidence: { type: "component", id: a }, text: "API <gateway> is modeled as a Service." }],
        statedContext: [{ evidence: { type: "design-context", field: "requirementsAndConstraints" }, excerpt: "<users>\n世界" }],
        tradeoffs: [{ condition: "traffic rises", benefit: "capacity may improve", downside: "cost may rise", evidence: [{ type: "connection", id: "e" as ConnectionId }] }],
        questions: [{ question: "What is the workload?", evidence: [{ type: "boundary", id: "z" as BoundaryId }] }],
      } } }} currentKey="changed" unavailableReason={null} editBlocked={false} dirtyBriefBlocked={false} onReview={() => {}} onCancel={() => {}} onDiscard={() => {}} />);
    for (const heading of ["Modeled facts", "Design Brief context", "Possible tradeoffs", "Questions to resolve"]) expect(html).toContain(heading);
    expect(html).toContain("If traffic rises");
    expect(html).toContain("earlier version of the architecture");
    expect(html).toContain("<details");
    expect(html).toContain("&lt;users&gt;");
    expect(html).not.toContain("<users>");
  });
});
