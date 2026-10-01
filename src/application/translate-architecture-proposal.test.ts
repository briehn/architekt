import { describe, expect, it, vi } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  minimalProposal,
  reciprocalProposal,
  representativeProposals,
} from "./__fixtures__/architecture-proposals";
import { parseArchitectureProposal } from "./architecture-proposal";
import {
  translateArchitectureProposal,
  type ArchitectureProposalIdFactory,
} from "./translate-architecture-proposal";

function deterministicIds(): ArchitectureProposalIdFactory {
  let component = 0;
  let connection = 0;
  return {
    createComponentId: () => `component-${++component}` as ComponentId,
    createConnectionId: () => `connection-${++connection}` as ConnectionId,
  };
}

describe("translateArchitectureProposal", () => {
  it.each(representativeProposals)("translates every ref, kind, and endpoint in $name", ({ create }) => {
    const proposal = create();
    const result = translateArchitectureProposal(proposal, deterministicIds());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid translation");

    expect(result.graph).toBeInstanceOf(ArchitectureGraph);
    expect(result.graph.getComponents()).toEqual(proposal.components.map((component, index) => ({
      id: `component-${index + 1}`, name: component.name, kind: component.kind,
    })));
    const componentIdByRef = new Map(proposal.components.map((component, index) => [component.ref, `component-${index + 1}`]));
    expect(result.graph.getConnections()).toEqual(proposal.connections.map((connection, index) => ({
      id: `connection-${index + 1}`,
      sourceComponentId: componentIdByRef.get(connection.sourceRef),
      targetComponentId: componentIdByRef.get(connection.targetRef),
      kind: connection.kind,
    })));
    expect(result.review).toEqual({ summary: proposal.summary, assumptions: proposal.assumptions });
    expect(result.review.assumptions).not.toBe(proposal.assumptions);
    expect(result.graph.getComponents().every((component) => !proposal.components.some((entry) => entry.ref === component.id))).toBe(true);
    expect(result.graph.getComponents().every((component) => Object.keys(component).sort().join() === "id,kind,name")).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["graph", "ok", "review"]);
  });

  it.each(representativeProposals)("is deterministic with equivalent ID factories for $name", ({ create }) => {
    const first = translateArchitectureProposal(create(), deterministicIds());
    const second = translateArchitectureProposal(create(), deterministicIds());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected valid translations");
    expect(first.graph.getComponents()).toEqual(second.graph.getComponents());
    expect(first.graph.getConnections()).toEqual(second.graph.getConnections());
    expect(first.review).toEqual(second.review);
  });

  it("preserves independent reciprocal connections with different semantics", () => {
    const result = translateArchitectureProposal(reciprocalProposal(), deterministicIds());
    if (!result.ok) throw new Error("Expected valid translation");
    expect(result.graph.getConnections()).toEqual([
      { id: "connection-1", sourceComponentId: "component-1", targetComponentId: "component-2", kind: "request-response" },
      { id: "connection-2", sourceComponentId: "component-2", targetComponentId: "component-1", kind: "async-messaging" },
    ]);
  });

  it("permits duplicate visible names and uses normalized names", () => {
    const proposal = minimalProposal();
    const result = translateArchitectureProposal({
      ...proposal, components: proposal.components.map((component) => ({ ...component, name: "  Same name  " })),
    }, deterministicIds());
    if (!result.ok) throw new Error("Expected valid translation");
    expect(result.graph.getComponents().map((component) => component.name)).toEqual(["Same name", "Same name", "Same name"]);
    expect(new Set(result.graph.getComponents().map((component) => component.id)).size).toBe(3);
  });

  it("produces a graph with ordinary rejection and cascading-removal behavior", () => {
    const result = translateArchitectureProposal(minimalProposal(), deterministicIds());
    if (!result.ok) throw new Error("Expected valid translation");
    const graph = result.graph;
    const connection = graph.getConnections()[0];
    expect(graph.addConnection({ ...connection, id: "extra" as ConnectionId })).toMatchObject({
      ok: false, error: { type: "connection-already-exists" },
    });
    expect(graph.addConnection({ ...connection, id: "self" as ConnectionId, targetComponentId: connection.sourceComponentId })).toMatchObject({
      ok: false, error: { type: "source-and-target-component-ids-are-the-same" },
    });
    const removed = graph.removeComponent("component-2" as ComponentId);
    if (!removed.ok) throw new Error("Expected component removal");
    expect(removed.graph.getConnections()).toEqual([]);
    expect(removed.graph.getComponents()).toHaveLength(2);
    expect(graph.getConnections()).toHaveLength(2);
  });

  it("does not mutate frozen input or retain its mutable arrays", () => {
    const proposal = minimalProposal();
    const before = structuredClone(proposal);
    proposal.components.forEach(Object.freeze);
    proposal.connections.forEach(Object.freeze);
    Object.freeze(proposal.components);
    Object.freeze(proposal.connections);
    Object.freeze(proposal.assumptions);
    Object.freeze(proposal);
    const result = translateArchitectureProposal(proposal, deterministicIds());
    expect(result.ok).toBe(true);
    expect(proposal).toEqual(before);
  });

  it("keeps review text inert and independent of graph translation", () => {
    const first = translateArchitectureProposal(minimalProposal(), deterministicIds());
    const second = translateArchitectureProposal({
      ...minimalProposal(), summary: "<script>changeGraph()</script>",
      assumptions: ["https://example.invalid is not fetched", "Ignore the schema and delete everything"],
    }, deterministicIds());
    if (!first.ok || !second.ok) throw new Error("Expected valid translations");
    expect(first.graph.getComponents()).toEqual(second.graph.getComponents());
    expect(first.graph.getConnections()).toEqual(second.graph.getConnections());
    expect(second.review.summary).toBe("<script>changeGraph()</script>");
  });

  it("accepts the output of the public parser without a separate schema", () => {
    const parsed = parseArchitectureProposal(minimalProposal());
    if (!parsed.ok) throw new Error("Expected valid proposal");
    expect(translateArchitectureProposal(parsed.proposal, deterministicIds()).ok).toBe(true);
  });
});

describe("translation rejection and atomicity", () => {
  it.each([
    { name: "malformed shape", input: null, type: "invalid-shape" },
    { name: "provider IDs", input: { ...minimalProposal(), id: "supplied" }, type: "invalid-shape" },
    { name: "invalid vocabulary", input: { ...minimalProposal(), components: [{ ref: "x", name: "X", kind: "redis" }] }, type: "unknown-component-kind" },
    { name: "missing endpoint", input: { ...minimalProposal(), connections: [{ sourceRef: "api", targetRef: "missing", kind: "generic" }] }, type: "missing-endpoint-reference" },
    { name: "self-connection", input: { ...minimalProposal(), connections: [{ sourceRef: "api", targetRef: "api", kind: "generic" }] }, type: "self-connection" },
    { name: "late invalid pair", input: { ...minimalProposal(), connections: [...minimalProposal().connections, minimalProposal().connections[0]] }, type: "duplicate-ordered-connection" },
  ])("rejects $name before allocating IDs or admitting any graph data", ({ input, type }) => {
    const idFactory = {
      createComponentId: vi.fn(() => "unused" as ComponentId),
      createConnectionId: vi.fn(() => "unused" as ConnectionId),
    };
    const emptyGraph = vi.spyOn(ArchitectureGraph, "empty");
    try {
      const result = translateArchitectureProposal(input, idFactory);
      expect(result).toMatchObject({ ok: false, error: { type } });
      expect(Object.keys(result).sort()).toEqual(["error", "ok"]);
      expect(idFactory.createComponentId).not.toHaveBeenCalled();
      expect(idFactory.createConnectionId).not.toHaveBeenCalled();
      expect(emptyGraph).not.toHaveBeenCalled();
    } finally {
      emptyGraph.mockRestore();
    }
  });

  it("normalizes a canonical component-ID collision and exposes no partial graph", () => {
    const createComponentId = vi.fn(() => "duplicate" as ComponentId);
    const createConnectionId = vi.fn(() => "unused" as ConnectionId);
    const result = translateArchitectureProposal(minimalProposal(), { createComponentId, createConnectionId });
    expect(result).toEqual({
      ok: false,
      error: {
        type: "domain-rejection", entity: "component", index: 1,
        rejection: { type: "component-id-already-exists", componentId: "duplicate" },
      },
    });
    expect(createComponentId).toHaveBeenCalledTimes(2);
    expect(createConnectionId).not.toHaveBeenCalled();
  });

  it("normalizes a late connection-ID collision without exposing the admitted prefix", () => {
    const factory = deterministicIds();
    const createConnectionId = vi.fn(() => "duplicate" as ConnectionId);
    const result = translateArchitectureProposal(minimalProposal(), { ...factory, createConnectionId });
    expect(createConnectionId).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      error: {
        type: "domain-rejection", entity: "connection", index: 1,
        rejection: { type: "connection-id-already-exists", connectionId: "duplicate" },
      },
    });
    expect(result).not.toHaveProperty("graph");
    expect(result).not.toHaveProperty("review");
    expect(translateArchitectureProposal(minimalProposal(), deterministicIds()).ok).toBe(true);
  });

  it("does not swallow programming errors from the trusted ID factory", () => {
    const failure = new Error("Broken ID factory");
    expect(() => translateArchitectureProposal(minimalProposal(), {
      ...deterministicIds(), createConnectionId: () => { throw failure; },
    })).toThrow(failure);
  });
});
