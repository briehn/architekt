import { describe, expect, it } from "vitest";

import { analyzeArchitecture } from "../application/architecture-analysis/architecture-analysis";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import { applyArchitectureProposal } from "../diagram/apply-architecture-proposal";
import { applyPortableDocument } from "../diagram/apply-portable-document";
import { createArchitectureEditorHistory, redoArchitectureEditorHistory, undoArchitectureEditorHistory } from "../diagram/architecture-editor-history";
import { createArchitectureEditorState } from "../diagram/architecture-editor-state";
import { savePendingArchitectureEditorState } from "../diagram/architecture-editor-save";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { toPersistedArchitectureEditorDocument } from "./architecture-editor-document";
import { exportPortableArchitectureDocument, parsePortableArchitectureDocument, portableArchitectureFilename, PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES } from "./portable-architecture-document";

function fullState() {
  let graph = ArchitectureGraph.empty();
  for (const [id, name, kind] of [["client", "Client", "client"], ["api", "API", "service"]] as const) {
    const result = graph.addComponent({ id: id as ComponentId, name, kind });
    if (!result.ok) throw new Error("Fixture rejected");
    graph = result.graph;
  }
  const connected = graph.addConnection({ id: "request" as ConnectionId, sourceComponentId: "client" as ComponentId, targetComponentId: "api" as ComponentId, kind: "request-response" });
  if (!connected.ok) throw new Error("Fixture rejected");
  const bounded = connected.graph.addBoundary({ id: "core" as BoundaryId, name: "Core", memberComponentIds: ["api" as ComponentId] });
  if (!bounded.ok) throw new Error("Fixture rejected");
  return {
    graph: bounded.graph,
    nodePositions: new Map([["client" as ComponentId, { x: -12, y: 30 }], ["api" as ComponentId, { x: 400, y: 96 }]]),
    designContext: { title: "My Checkout Architecture", requirementsAndConstraints: "Keep orders durable", assumptionsAndOpenQuestions: "Peak traffic unknown", decisionsAndTradeoffs: "Queue adds latency" },
    nodeMeasurements: new Map([["api" as ComponentId, { width: 200, height: 80 }]]),
  };
}

const empty = createArchitectureEditorState(ArchitectureGraph.empty());

function validLegacy(version: 1 | 2 | 3 | 4) {
  const current = toPersistedArchitectureEditorDocument(fullState());
  return {
    schemaVersion: version,
    graph: {
      components: current.graph.components.map((component) => version === 1 ? { id: component.id, name: component.name } : component),
      connections: current.graph.connections.map((connection) => version <= 2 ? { id: connection.id, sourceComponentId: connection.sourceComponentId, targetComponentId: connection.targetComponentId } : connection),
      ...(version === 4 ? { boundaries: current.graph.boundaries } : {}),
    },
    nodePositions: current.nodePositions,
  };
}

describe("portable architecture document", () => {
  it("exports empty and full V5 documents deterministically without transient state", () => {
    const emptyExport = exportPortableArchitectureDocument(empty);
    expect(emptyExport.filename).toBe("architecture.architekt.json");
    expect(JSON.parse(emptyExport.json)).toEqual(toPersistedArchitectureEditorDocument(empty));
    expect(emptyExport.json).toContain("\n  \"schemaVersion\": 5");
    expect(emptyExport.json.endsWith("\n")).toBe(true);

    const state = fullState();
    const beforeMeasurements = state.nodeMeasurements;
    const exported = exportPortableArchitectureDocument(state);
    expect(exported).toEqual(exportPortableArchitectureDocument(state));
    expect(exported.filename).toBe("my-checkout-architecture.architekt.json");
    const document = JSON.parse(exported.json);
    expect(document.designContext).toEqual(state.designContext);
    expect(document.graph.boundaries).toEqual([{ id: "core", name: "Core", memberComponentIds: ["api"] }]);
    expect(document.nodePositions).toEqual([{ componentId: "client", x: -12, y: 30 }, { componentId: "api", x: 400, y: 96 }]);
    expect(exported.json).not.toMatch(/nodeMeasurements|history|viewport|selection|prompt|proposal|findings/);
    expect(state.nodeMeasurements).toBe(beforeMeasurements);
  });

  it("makes safe, bounded filenames without changing the title", () => {
    expect(portableArchitectureFilename("" )).toBe("architecture.architekt.json");
    expect(portableArchitectureFilename("../CON\\payments: * A?" )).toBe("con-payments-a.architekt.json");
    expect(portableArchitectureFilename("CON")).toBe("architecture-con.architekt.json");
    expect(portableArchitectureFilename("Crème brûlée" )).toBe("creme-brulee.architekt.json");
    expect(portableArchitectureFilename("設計 図" )).toBe("設計-図.architekt.json");
    expect(portableArchitectureFilename("x".repeat(150))).toBe(`${"x".repeat(60)}.architekt.json`);
  });

  it("parses V5 including empty, context-only, boundaries, positions, and graph-derived analysis", () => {
    for (const state of [empty, { ...empty, designContext: { ...empty.designContext, title: "Context only" } }, fullState()]) {
      const parsed = parsePortableArchitectureDocument(exportPortableArchitectureDocument(state).json);
      if (!parsed.ok) throw new Error("Expected portable document");
      expect(toPersistedArchitectureEditorDocument(parsed.state)).toEqual(toPersistedArchitectureEditorDocument(state));
      expect(parsed.preview.hasDesignBrief).toBe(state.designContext.title !== "");
      expect(parsed.preview.sourceVersion).toBe(5);
      expect(parsed.state.nodeMeasurements.size).toBe(0);
      expect(analyzeArchitecture(parsed.state.graph)).toEqual(analyzeArchitecture(state.graph));
    }
  });

  it("imports V1–V4 through existing migration behavior", () => {
    for (const version of [1, 2, 3, 4] as const) {
      const parsed = parsePortableArchitectureDocument(JSON.stringify(validLegacy(version)));
      if (!parsed.ok) throw new Error(`Expected V${version} import`);
      expect(parsed.preview.sourceVersion).toBe(version);
      expect(parsed.state.designContext.title).toBe("");
      expect(parsed.state.graph.getBoundaries()).toHaveLength(version === 4 ? 1 : 0);
      expect(parsed.state.nodePositions.get("api" as ComponentId)).toEqual({ x: 400, y: 96 });
    }
  });

  it("rejects bad JSON, unsupported versions, oversized text, and malformed canonical records atomically", () => {
    const valid = toPersistedArchitectureEditorDocument(fullState());
    const invalid = [
      { ...valid, designContext: { ...valid.designContext, title: "x".repeat(121) } },
      { ...valid, graph: { ...valid.graph, components: [{ ...valid.graph.components[0], kind: "redis" }, valid.graph.components[1]] } },
      { ...valid, graph: { ...valid.graph, components: [valid.graph.components[0], valid.graph.components[0]] } },
      { ...valid, graph: { ...valid.graph, connections: [{ ...valid.graph.connections[0], targetComponentId: "missing" }] } },
      { ...valid, graph: { ...valid.graph, boundaries: [{ ...valid.graph.boundaries[0], memberComponentIds: ["missing"] }] } },
      { ...valid, graph: { ...valid.graph, boundaries: [{ ...valid.graph.boundaries[0], memberComponentIds: ["api", "api"] }] } },
      { ...valid, nodePositions: [{ componentId: "api", x: 0, y: 0 }] },
      { ...valid, nodePositions: [{ ...valid.nodePositions[0], x: "bad" }, valid.nodePositions[1]] },
      { ...valid, graph: { ...valid.graph, components: [{ ...valid.graph.components[0], position: { x: 1, y: 2 } }, valid.graph.components[1]] } },
      { ...valid, viewport: { x: 0, y: 0 } },
    ];
    for (const value of invalid) expect(parsePortableArchitectureDocument(JSON.stringify(value))).toEqual({ ok: false, error: "invalid-document" });
    expect(parsePortableArchitectureDocument("{" )).toEqual({ ok: false, error: "invalid-json" });
    expect(parsePortableArchitectureDocument(JSON.stringify({ ...valid, schemaVersion: 99 }))).toEqual({ ok: false, error: "unsupported-version" });
    expect(parsePortableArchitectureDocument(" ".repeat(PORTABLE_ARCHITECTURE_DOCUMENT_MAX_BYTES + 1))).toEqual({ ok: false, error: "file-too-large" });
  });

  it("replaces the full document in one history step while AI Apply still preserves context", () => {
    const before = fullState();
    const imported = parsePortableArchitectureDocument(exportPortableArchitectureDocument(empty).json);
    if (!imported.ok) throw new Error("Expected import fixture");
    const initial = createArchitectureEditorHistory(before);
    const applied = applyPortableDocument(initial, imported.state);
    expect(applied.past).toHaveLength(1);
    expect(applied.present.designContext.title).toBe("");
    expect(applied.present.graph.getComponents()).toHaveLength(0);
    expect(applied.present.nodePositions.size).toBe(0);
    expect(applied.present.nodeMeasurements.size).toBe(0);
    const undone = undoArchitectureEditorHistory(applied);
    expect(undone.present.graph).toBe(before.graph);
    expect(undone.present.nodePositions).toBe(before.nodePositions);
    expect(undone.present.designContext).toBe(before.designContext);
    expect(redoArchitectureEditorHistory(undone).present.designContext.title).toBe("");
    expect(initial.present).toBe(before);
    let component = 0;
    let connection = 0;
    const ai = applyArchitectureProposal(initial, minimalProposal(), {
      createComponentId: () => `new-component-${++component}` as ComponentId,
      createConnectionId: () => `new-connection-${++connection}` as ConnectionId,
    });
    if (!ai.ok) throw new Error("Expected AI Apply fixture");
    expect(ai.history.present.designContext).toBe(before.designContext);
    expect(applied.present.designContext.title).toBe("");
  });

  it("lets ordinary pending-save persistence store the imported V5 state", () => {
    const parsed = parsePortableArchitectureDocument(exportPortableArchitectureDocument(fullState()).json);
    if (!parsed.ok) throw new Error("Expected import fixture");
    const applied = applyPortableDocument(createArchitectureEditorHistory(empty), parsed.state);
    let stored = "";
    const storage = { getItem: () => stored || null, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => { stored = ""; } };
    expect(savePendingArchitectureEditorState(storage, applied.present, empty)).toEqual({ status: "saved" });
    expect(JSON.parse(stored).designContext.title).toBe("My Checkout Architecture");
    expect(JSON.parse(stored).graph.boundaries).toHaveLength(1);
  });
});
