import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_DESIGN_CONTEXT } from "../application/design-context";
import { prepareArchitectureReviewSnapshot, getArchitectureReviewSnapshotKey } from "../application/architecture-review/review-snapshot";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import { parseArchitectureReviewResponse } from "./architecture-review-controller";
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
        tradeoffs: [{ condition: "If traffic rises", benefit: "capacity may improve", downside: "cost may rise", evidence: [{ type: "connection", id: "e" as ConnectionId }] }],
        questions: [{ question: "What is the workload?", evidence: [{ type: "boundary", id: "z" as BoundaryId }] }],
      } } }} currentKey="changed" unavailableReason={null} editBlocked={false} dirtyBriefBlocked={false} aiAccessEnabled={true} onReview={() => {}} onCancel={() => {}} onDiscard={() => {}} />);
    for (const heading of ["Modeled facts", "Design Brief context", "Possible tradeoffs", "Questions to resolve"]) expect(html).toContain(heading);
    expect(html).toContain("If traffic rises");
    expect(html).not.toContain("If If traffic rises");
    expect(html).toContain("earlier version of the architecture");
    expect(html).toContain("<details");
    expect(html).toContain("&lt;users&gt;");
    expect(html).not.toContain("<users>");
  });

  it("renders a previously accepted Sol review without adding another conditional prefix", () => {
    const evaluation = JSON.parse(readFileSync(new URL("../../docs/evaluations/grounded-review-v1-live-2026-10-11.json", import.meta.url), "utf8")) as {
      cases: { fixture: string; model: string; status: number; result: unknown }[];
    };
    const captured = evaluation.cases.find((entry) => entry.fixture === "01-client-api-database" && entry.model === "gpt-6-sol" && entry.status === 200);
    if (!captured) throw Error("Missing accepted Review evaluation case");

    let recordedGraph = ArchitectureGraph.empty();
    for (const component of [
      { id: "client" as ComponentId, name: "Browser", kind: "client" as const },
      { id: "api" as ComponentId, name: "API", kind: "service" as const },
      { id: "db" as ComponentId, name: "Orders DB", kind: "database" as const },
    ]) {
      const added = recordedGraph.addComponent(component);
      if (!added.ok) throw Error("Invalid captured graph fixture");
      recordedGraph = added.graph;
    }
    for (const connection of [
      { id: "request" as ConnectionId, sourceComponentId: "client" as ComponentId, targetComponentId: "api" as ComponentId, kind: "request-response" as const },
      { id: "read" as ConnectionId, sourceComponentId: "api" as ComponentId, targetComponentId: "db" as ComponentId, kind: "data-access" as const },
    ]) {
      const added = recordedGraph.addConnection(connection);
      if (!added.ok) throw Error("Invalid captured connection fixture");
      recordedGraph = added.graph;
    }
    const recordedContext = {
      title: "Order lookup",
      requirementsAndConstraints: "Customers can look up orders.",
      assumptionsAndOpenQuestions: "Peak request volume is unknown.",
      decisionsAndTradeoffs: "Start with one API and one database.",
    };
    const prepared = prepareArchitectureReviewSnapshot(recordedGraph, recordedContext);
    if (!prepared.ok) throw Error("Invalid captured Review snapshot");
    const recordedReview = parseArchitectureReviewResponse({ review: captured.result }, prepared.snapshot);
    if (!recordedReview) throw Error("Captured Review no longer passes client validation");

    const html = renderToStaticMarkup(<ArchitectureReviewPanel
      state={{ status: "ready", completed: { key: getArchitectureReviewSnapshotKey(prepared.snapshot), snapshot: prepared.snapshot, review: recordedReview } }}
      currentKey={getArchitectureReviewSnapshotKey(prepared.snapshot)} unavailableReason={null} editBlocked={false} dirtyBriefBlocked={false} aiAccessEnabled={true}
      onReview={() => {}} onCancel={() => {}} onDiscard={() => {}} />);
    const condition = "If the modeled path supports the intended order lookup and the single-API, single-database arrangement remains appropriate";
    expect(html).toContain(condition);
    expect(html).not.toContain(`If ${condition}`);
    expect(html).toContain("Browser has a directed request/response connection to API.");
    expect(html).toContain("Customers can look up orders.");
    expect(html).toContain("Possible benefit:");
    expect(html).toContain("Possible downside:");
    expect(html).toContain("What request-volume range and response expectations");
    expect(html).toContain("Evidence");
  });
});
