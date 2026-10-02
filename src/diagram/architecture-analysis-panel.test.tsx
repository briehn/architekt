import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { analyzeArchitecture } from "../application/architecture-analysis/architecture-analysis";
import type { ArchitectureComponentKind } from "../domain/architecture-component";
import type { ArchitectureConnectionKind } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { toPersistedArchitectureEditorDocument } from "../persistence/architecture-editor-document";
import { applyArchitectureProposal } from "./apply-architecture-proposal";
import {
  ArchitectureAnalysisContent,
  ArchitectureAnalysisPanel,
  getAnalysisFindingCountAnnouncement,
} from "./architecture-analysis-panel";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import { createArchitectureEditorState } from "./architecture-editor-state";

type TestComponent = Readonly<{
  id: string;
  name: string;
  kind: ArchitectureComponentKind;
}>;
type TestConnection = Readonly<{
  id: string;
  source: string;
  target: string;
  kind: ArchitectureConnectionKind;
}>;

function graphWith(
  components: readonly TestComponent[],
  connections: readonly TestConnection[] = [],
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();
  for (const component of components) {
    const result = graph.addComponent({ ...component, id: component.id as ComponentId });
    if (!result.ok) throw new Error("Invalid component fixture");
    graph = result.graph;
  }
  for (const connection of connections) {
    const result = graph.addConnection({
      id: connection.id as ConnectionId,
      sourceComponentId: connection.source as ComponentId,
      targetComponentId: connection.target as ComponentId,
      kind: connection.kind,
    });
    if (!result.ok) throw new Error("Invalid connection fixture");
    graph = result.graph;
  }
  return graph;
}

function renderContent(graph: ArchitectureGraph): string {
  return renderToStaticMarkup(
    <ArchitectureAnalysisContent analysis={analyzeArchitecture(graph)} graph={graph} />,
  );
}

const client = { id: "client", name: "Client", kind: "client" } as const;
const database = { id: "database", name: "Database", kind: "database" } as const;
const service = { id: "service", name: "Service", kind: "service" } as const;

describe("ArchitectureAnalysisPanel", () => {
  it("starts as a small native disclosure with a keyboard-operable summary", () => {
    const markup = renderToStaticMarkup(<ArchitectureAnalysisPanel graph={ArchitectureGraph.empty()} />);
    expect(markup).toContain("<details");
    expect(markup).toContain("<summary");
    expect(markup).toContain("Analysis</summary>");
    expect(markup).not.toContain(" open=\"\"");
    expect(markup).not.toContain("Disconnected regions");
    expect(markup).toContain('aria-live="polite"');
  });

  it("shows all four summary values and an invitation for an empty graph", () => {
    const markup = renderContent(ArchitectureGraph.empty());
    expect(markup).toContain("Summary");
    expect(markup).toContain("Components</dt><dd");
    expect(markup).toContain("Connections</dt><dd");
    expect(markup).toContain("Disconnected regions</dt><dd");
    expect(markup).toContain("Reciprocal pairs</dt><dd");
    expect(markup).toContain("Add components to make analysis useful.");
    expect(markup).toContain("does not establish runtime behavior, security, scalability, or correctness");
    expect(markup).not.toContain("Everything looks good");
  });

  it("renders all five findings in neutral review and structure sections", () => {
    const graph = graphWith(
      [client, database, { id: "queue", name: "Queue", kind: "queue" }],
      [
        { id: "client-db", source: "client", target: "database", kind: "request-response" },
        { id: "db-client", source: "database", target: "client", kind: "request-response" },
      ],
    );
    const markup = renderContent(graph);
    expect(markup).toContain("Review questions</h2>");
    expect(markup).toContain("Structure</h2>");
    expect(markup).toContain("Client connects directly to Database in this diagram.");
    expect(markup).toContain("Client and Database each have a request/response connection to the other.");
    expect(markup).toContain("1 component has no connections in this diagram.");
    expect(markup).toContain("The diagram contains 2 disconnected regions.");
    expect(markup).toContain("These 2 components form a region containing directed cycles.");
    expect(markup).toContain("Review question:");
    expect(markup).toContain("Example cycle:");
    expect(markup).toContain("Region:");
    expect(markup).toContain("Queue");
    expect(markup).toContain('aria-label="Evidence for');
    expect(markup).not.toMatch(/critical|overloaded|bottleneck|architecture health/i);
  });

  it("provides expandable descriptive connection counts with current names", () => {
    const graph = graphWith(
      [client, database],
      [{ id: "client-db", source: "client", target: "database", kind: "data-access" }],
    );
    const markup = renderContent(graph);
    expect(markup).toContain("Connection counts</summary>");
    expect(markup).toContain("Client</span>: 0 incoming, 1 outgoing relationships");
    expect(markup).toContain("Database</span>: 1 incoming, 0 outgoing relationships");
    expect(markup).toContain("Data access");
  });

  it("uses cautious no-findings wording even when metrics remain visible", () => {
    const graph = graphWith(
      [client, service],
      [{ id: "client-service", source: "client", target: "service", kind: "generic" }],
    );
    const markup = renderContent(graph);
    expect(markup).toContain("No observations or review questions from the current checks.");
    expect(markup).toContain("Connection counts</summary>");
    expect(markup).not.toMatch(/everything looks good|passed|healthy/i);
  });

  it("disambiguates duplicate names in descriptions, evidence, and counts", () => {
    const graph = graphWith(
      [{ ...client, name: "Shared" }, { ...database, name: "Shared" }],
      [{ id: "direct", source: "client", target: "database", kind: "generic" }],
    );
    const markup = renderContent(graph);
    expect(markup).toContain("Shared (client) connects directly to Shared (database)");
    expect(markup).toContain("Shared (client) → Shared (database)");
    expect(markup).toContain("Shared (client)</span>: 0 incoming, 1 outgoing relationships");
  });

  it("renders changed graph and semantic findings after a component-kind edit", () => {
    const graph = graphWith(
      [{ ...client, kind: "generic" }, database],
      [{ id: "direct", source: "client", target: "database", kind: "generic" }],
    );
    const before = renderContent(graph);
    const change = graph.changeComponentKind("client" as ComponentId, "client");
    if (!change.ok) throw new Error("Expected a kind change");
    const after = renderContent(change.graph);
    expect(before).not.toContain("connects directly to Database");
    expect(after).toContain("Client connects directly to Database");
  });

  it("renders a reciprocal review after a connection-kind edit", () => {
    const graph = graphWith(
      [client, service],
      [
        { id: "out", source: "client", target: "service", kind: "request-response" },
        { id: "back", source: "service", target: "client", kind: "generic" },
      ],
    );
    const before = renderContent(graph);
    const change = graph.changeConnectionKind("back" as ConnectionId, "request-response");
    if (!change.ok) throw new Error("Expected a kind change");
    const after = renderContent(change.graph);
    expect(before).not.toContain("each have a request/response connection");
    expect(after).toContain("each have a request/response connection");
    expect(after).toContain("region containing directed cycles");
  });

  it("follows Undo and Redo graph snapshots without recording a panel transition", () => {
    const graph = graphWith([client, database]);
    const initialHistory = createArchitectureEditorHistory(createArchitectureEditorState(graph));
    const added = graph.addConnection({
      id: "direct" as ConnectionId,
      sourceComponentId: "client" as ComponentId,
      targetComponentId: "database" as ComponentId,
      kind: "generic",
    });
    if (!added.ok) throw new Error("Expected a connection");
    const editedHistory = recordArchitectureEditorState(initialHistory, {
      ...initialHistory.present,
      graph: added.graph,
    });
    expect(renderContent(editedHistory.present.graph)).toContain("connects directly to Database");
    const undone = undoArchitectureEditorHistory(editedHistory);
    expect(renderContent(undone.present.graph)).not.toContain("connects directly to Database");
    const redone = redoArchitectureEditorHistory(undone);
    expect(renderContent(redone.present.graph)).toContain("connects directly to Database");

    const beforePanel = toPersistedArchitectureEditorDocument(redone.present);
    renderToStaticMarkup(<ArchitectureAnalysisPanel graph={redone.present.graph} />);
    renderContent(redone.present.graph);
    expect(redone.past).toHaveLength(1);
    expect(toPersistedArchitectureEditorDocument(redone.present)).toEqual(beforePanel);
  });

  it("presents the graph after AI Apply and preserves one-step history behavior", () => {
    const initial = createArchitectureEditorHistory(
      createArchitectureEditorState(graphWith([service])),
    );
    const result = applyArchitectureProposal(initial, minimalProposal(), {
      createComponentId: (() => {
        let next = 0;
        return () => `generated-component-${++next}` as ComponentId;
      })(),
      createConnectionId: (() => {
        let next = 0;
        return () => `generated-connection-${++next}` as ConnectionId;
      })(),
    });
    if (!result.ok) throw new Error("Expected proposal Apply");
    expect(renderContent(initial.present.graph)).toContain("1 component has no connections");
    const appliedMarkup = renderContent(result.history.present.graph);
    expect(appliedMarkup).toContain("Components</dt><dd class=\"font-semibold text-text-primary\">3</dd>");
    expect(appliedMarkup).toContain("No observations or review questions from the current checks.");
    expect(result.history.past).toHaveLength(1);
    expect(renderContent(undoArchitectureEditorHistory(result.history).present.graph)).toContain(
      "1 component has no connections",
    );
  });

  it("uses the same graph reference and findings after position-only changes", () => {
    const graph = graphWith([client, service], [
      { id: "edge", source: "client", target: "service", kind: "generic" },
    ]);
    const state = createArchitectureEditorState(graph);
    const moved = {
      ...state,
      nodePositions: new Map(state.nodePositions).set("client" as ComponentId, { x: 500, y: 200 }),
    };
    expect(moved.graph).toBe(state.graph);
    expect(analyzeArchitecture(moved.graph)).toEqual(analyzeArchitecture(state.graph));
    expect(renderContent(moved.graph)).toBe(renderContent(state.graph));
  });

  it("formats concise polite count changes without pass or fail language", () => {
    const none = analyzeArchitecture(graphWith([client, service], [
      { id: "edge", source: "client", target: "service", kind: "generic" },
    ]));
    const some = analyzeArchitecture(graphWith([client, database], [
      { id: "direct", source: "client", target: "database", kind: "generic" },
    ]));
    expect(getAnalysisFindingCountAnnouncement(none)).toBe(
      "Analysis updated: 0 review questions and 0 structural observations.",
    );
    expect(getAnalysisFindingCountAnnouncement(some)).toBe(
      "Analysis updated: 1 review question and 0 structural observations.",
    );
  });
});
