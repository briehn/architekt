import { describe, expect, it } from "vitest";

import type { ArchitectureComponentKind } from "../../domain/architecture-component";
import type { ArchitectureConnectionKind } from "../../domain/architecture-connection";
import { ArchitectureGraph } from "../../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../../domain/identifiers";
import {
  analyzeArchitecture,
  describeArchitectureFinding,
  type ArchitectureFinding,
} from "./architecture-analysis";

function componentId(id: string): ComponentId {
  return id as ComponentId;
}

function connectionId(id: string): ConnectionId {
  return id as ConnectionId;
}

type TestConnection = Readonly<{
  id: string;
  source: string;
  target: string;
  kind?: ArchitectureConnectionKind;
}>;

function graphWith(
  componentIds: readonly string[],
  connections: readonly TestConnection[] = [],
  names: Readonly<Record<string, string>> = {},
  kinds: Readonly<Record<string, ArchitectureComponentKind>> = {},
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();
  for (const id of componentIds) {
    const result = graph.addComponent({
      id: componentId(id),
      name: names[id] ?? id,
      kind: kinds[id] ?? "generic",
    });
    if (!result.ok) throw new Error(`Invalid test component: ${id}`);
    graph = result.graph;
  }
  for (const { id, source, target, kind } of connections) {
    const result = graph.addConnection({
      id: connectionId(id),
      sourceComponentId: componentId(source),
      targetComponentId: componentId(target),
      kind: kind ?? "generic",
    });
    if (!result.ok) throw new Error(`Invalid test connection: ${id}`);
    graph = result.graph;
  }
  return graph;
}

function expectValidReferences(
  graph: ArchitectureGraph,
  findings: readonly ArchitectureFinding[],
): void {
  const componentIds = new Set(graph.getComponents().map(({ id }) => id));
  const connections = new Map(graph.getConnections().map((connection) => [connection.id, connection]));
  for (const finding of findings) {
    expect(finding.referencedComponentIds.every((id) => componentIds.has(id))).toBe(true);
    expect(finding.referencedConnectionIds.every((id) => connections.has(id))).toBe(true);
    if (finding.ruleId !== "directed-cyclic-region") continue;

    const { witness, memberComponentIds, internalConnectionIds } = finding.evidence;
    expect(memberComponentIds).toEqual(finding.referencedComponentIds);
    expect(internalConnectionIds).toEqual(finding.referencedConnectionIds);
    expect(witness.componentIds.length).toBeGreaterThan(2);
    expect(witness.connectionIds).toHaveLength(witness.componentIds.length - 1);
    expect(witness.componentIds[0]).toBe(witness.componentIds.at(-1));
    expect(new Set(witness.componentIds.slice(0, -1)).size).toBe(witness.connectionIds.length);
    for (const [index, id] of witness.connectionIds.entries()) {
      const connection = connections.get(id);
      expect(connection).toBeDefined();
      expect(connection?.sourceComponentId).toBe(witness.componentIds[index]);
      expect(connection?.targetComponentId).toBe(witness.componentIds[index + 1]);
      expect(internalConnectionIds).toContain(id);
    }
  }
}

describe("analyzeArchitecture", () => {
  it("returns zero metrics and no findings for an empty graph", () => {
    expect(analyzeArchitecture(ArchitectureGraph.empty())).toEqual({
      summary: {
        componentCount: 0,
        connectionCount: 0,
        weaklyConnectedRegionCount: 0,
        reciprocalPairCount: 0,
      },
      componentDegrees: [],
      findings: [],
    });
  });

  it("reports one isolated component without claiming a disconnection", () => {
    const analysis = analyzeArchitecture(graphWith(["a"]));
    expect(analysis.summary).toEqual({
      componentCount: 1,
      connectionCount: 0,
      weaklyConnectedRegionCount: 1,
      reciprocalPairCount: 0,
    });
    expect(analysis.componentDegrees).toEqual([
      { componentId: "a", incoming: 0, outgoing: 0 },
    ]);
    expect(analysis.findings).toEqual([
      {
        key: '["isolated-components","a"]',
        ruleId: "isolated-components",
        category: "structure",
        referencedComponentIds: ["a"],
        referencedConnectionIds: [],
        evidence: { incoming: 0, outgoing: 0 },
      },
    ]);
    expect(describeArchitectureFinding(analysis.findings[0], graphWith(["a"]))).toEqual({
      message: "1 component has no connections in this diagram.",
    });
  });

  it("counts a one-way connection and keeps both nodes in one weak region", () => {
    const analysis = analyzeArchitecture(
      graphWith(["b", "a"], [{ id: "ab", source: "a", target: "b" }]),
    );
    expect(analysis.componentDegrees).toEqual([
      { componentId: "a", incoming: 0, outgoing: 1 },
      { componentId: "b", incoming: 1, outgoing: 0 },
    ]);
    expect(analysis.summary).toMatchObject({
      componentCount: 2,
      connectionCount: 1,
      weaklyConnectedRegionCount: 1,
      reciprocalPairCount: 0,
    });
    expect(analysis.findings).toEqual([]);
  });

  it("groups isolated components and partitions all nodes into weak regions", () => {
    const graph = graphWith(
      ["e", "c", "a", "d", "b"],
      [
        { id: "ba", source: "b", target: "a" },
        { id: "dc", source: "d", target: "c" },
      ],
    );
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary.weaklyConnectedRegionCount).toBe(3);
    expect(analysis.findings.map(({ ruleId }) => ruleId)).toEqual([
      "isolated-components",
      "disconnected-structure",
    ]);
    expect(analysis.findings[0].referencedComponentIds).toEqual(["e"]);
    expect(analysis.findings[1]).toMatchObject({
      key: '["disconnected-structure"]',
      referencedComponentIds: ["a", "b", "c", "d", "e"],
      evidence: { regions: [["a", "b"], ["c", "d"], ["e"]] },
    });
    expect(describeArchitectureFinding(analysis.findings[1], graph)).toEqual({
      message: "The diagram contains 3 disconnected regions.",
    });
    expectValidReferences(graph, analysis.findings);
  });

  it("groups multiple isolated components into one finding", () => {
    const analysis = analyzeArchitecture(graphWith(["z", "a", "b"]));
    expect(analysis.summary.weaklyConnectedRegionCount).toBe(3);
    expect(analysis.findings[0].referencedComponentIds).toEqual(["a", "b", "z"]);
    expect(describeArchitectureFinding(analysis.findings[0], graphWith(["z", "a", "b"]))).toEqual({
      message: "3 components have no connections in this diagram.",
    });
  });

  it.each([
    {
      name: "acyclic chain",
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
        { id: "cd", source: "c", target: "d" },
      ],
    },
    {
      name: "DAG diamond",
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "ac", source: "a", target: "c" },
        { id: "bd", source: "b", target: "d" },
        { id: "cd", source: "c", target: "d" },
      ],
    },
  ])("does not mistake an $name for a directed cycle", ({ edges }) => {
    const analysis = analyzeArchitecture(graphWith(["a", "b", "c", "d"], edges));
    expect(analysis.summary.weaklyConnectedRegionCount).toBe(1);
    expect(analysis.findings).toEqual([]);
  });

  it("counts a reciprocal pair once and reports its two-node directed cycle", () => {
    const graph = graphWith(["b", "a"], [
      { id: "ba", source: "b", target: "a" },
      { id: "ab", source: "a", target: "b" },
    ]);
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary.reciprocalPairCount).toBe(1);
    expect(analysis.componentDegrees).toEqual([
      { componentId: "a", incoming: 1, outgoing: 1 },
      { componentId: "b", incoming: 1, outgoing: 1 },
    ]);
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0]).toMatchObject({
      key: '["directed-cyclic-region","a","b"]',
      referencedComponentIds: ["a", "b"],
      referencedConnectionIds: ["ab", "ba"],
      evidence: {
        memberComponentIds: ["a", "b"],
        internalConnectionIds: ["ab", "ba"],
        witness: {
          componentIds: ["a", "b", "a"],
          connectionIds: ["ab", "ba"],
        },
      },
    });
    expectValidReferences(graph, analysis.findings);
  });

  it("keeps structural findings in fixed rule order when they coexist", () => {
    const analysis = analyzeArchitecture(graphWith(["c", "b", "a"], [
      { id: "ba", source: "b", target: "a" },
      { id: "ab", source: "a", target: "b" },
    ]));
    expect(analysis.findings.map(({ ruleId }) => ruleId)).toEqual([
      "isolated-components",
      "disconnected-structure",
      "directed-cyclic-region",
    ]);
  });

  it("reports one larger SCC with its internal edges and a valid cycle witness", () => {
    const graph = graphWith(["d", "c", "b", "a"], [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
      { id: "ca", source: "c", target: "a" },
      { id: "cd", source: "c", target: "d" },
      { id: "dc", source: "d", target: "c" },
    ]);
    const analysis = analyzeArchitecture(graph);
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0].referencedComponentIds).toEqual(["a", "b", "c", "d"]);
    expect(analysis.findings[0].referencedConnectionIds).toEqual(["ab", "bc", "ca", "cd", "dc"]);
    expectValidReferences(graph, analysis.findings);
    expect(describeArchitectureFinding(analysis.findings[0], graph)).toEqual({
      message: "These 4 components form a region containing directed cycles.",
      reviewQuestion: "Review whether these connection directions are intentional.",
    });
  });

  it("reports separate cyclic SCCs even when a one-way edge connects them", () => {
    const graph = graphWith(["e", "d", "c", "b", "a"], [
      { id: "ab", source: "a", target: "b" },
      { id: "ba", source: "b", target: "a" },
      { id: "bc", source: "b", target: "c" },
      { id: "cd", source: "c", target: "d" },
      { id: "de", source: "d", target: "e" },
      { id: "ec", source: "e", target: "c" },
    ]);
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary.weaklyConnectedRegionCount).toBe(1);
    expect(analysis.summary.reciprocalPairCount).toBe(1);
    expect(analysis.findings.map(({ referencedComponentIds }) => referencedComponentIds)).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
    expect(analysis.findings.map(({ referencedConnectionIds }) => referencedConnectionIds)).toEqual([
      ["ab", "ba"],
      ["cd", "de", "ec"],
    ]);
    expectValidReferences(graph, analysis.findings);
  });

  it("is independent of component/connection insertion order and duplicate names", () => {
    const components = ["z", "a", "b", "c"];
    const edges = [
      { id: "za", source: "z", target: "a" },
      { id: "az", source: "a", target: "z" },
      { id: "bc", source: "b", target: "c" },
    ];
    const names = { z: "Same", a: "Same", b: "Same", c: "Same" };
    const first = analyzeArchitecture(graphWith(components, edges, names));
    const second = analyzeArchitecture(
      graphWith([...components].reverse(), [...edges].reverse(), names),
    );
    expect(first).toEqual(second);
    expect(first.summary.reciprocalPairCount).toBe(1);
    expect(new Set(first.findings.map(({ key }) => key)).size).toBe(first.findings.length);
  });

  it("keeps finding keys stable when a component is renamed", () => {
    const graph = graphWith(["a", "b", "c"], [
      { id: "ab", source: "a", target: "b" },
      { id: "ba", source: "b", target: "a" },
    ]);
    const rename = graph.renameComponent(componentId("a"), "Renamed");
    if (!rename.ok) throw new Error("Expected valid rename");
    const before = analyzeArchitecture(graph);
    const after = analyzeArchitecture(rename.graph);
    expect(after).toEqual(before);
    expect(after.findings.map(({ key }) => key)).toEqual(before.findings.map(({ key }) => key));
  });

  it("keeps all finding references valid and leaves the input graph unchanged", () => {
    const graph = graphWith(["a", "b", "c", "d"], [
      { id: "ab", source: "a", target: "b" },
      { id: "ba", source: "b", target: "a" },
      { id: "bc", source: "b", target: "c" },
    ]);
    const componentsBefore = graph.getComponents();
    const connectionsBefore = graph.getConnections();
    const analysis = analyzeArchitecture(graph);
    expectValidReferences(graph, analysis.findings);
    expect(graph.getComponents()).toEqual(componentsBefore);
    expect(graph.getConnections()).toEqual(connectionsBefore);
    expect(analyzeArchitecture(graph)).toEqual(analysis);
  });

  it("handles 100 nodes and 198 reciprocal edges without enumerating cycles", () => {
    const ids = Array.from({ length: 100 }, (_, index) => `node-${String(index).padStart(3, "0")}`);
    const edges: TestConnection[] = [];
    for (let index = 0; index < ids.length - 1; index += 1) {
      edges.push(
        { id: `forward-${index}`, source: ids[index], target: ids[index + 1] },
        { id: `reverse-${index}`, source: ids[index + 1], target: ids[index] },
      );
    }
    const graph = graphWith(ids, edges);
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary).toEqual({
      componentCount: 100,
      connectionCount: 198,
      weaklyConnectedRegionCount: 1,
      reciprocalPairCount: 99,
    });
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0].referencedComponentIds).toHaveLength(100);
    expect(analysis.findings[0].referencedConnectionIds).toHaveLength(198);
    if (analysis.findings[0].ruleId !== "directed-cyclic-region") {
      throw new Error("Expected one cyclic region");
    }
    expect(analysis.findings[0].evidence.witness.componentIds).toHaveLength(3);
    expect(analysis.componentDegrees[0]).toEqual({
      componentId: componentId(ids[0]), incoming: 1, outgoing: 1,
    });
    expect(analysis.componentDegrees[50]).toEqual({
      componentId: componentId(ids[50]), incoming: 2, outgoing: 2,
    });
    expectValidReferences(graph, analysis.findings);
  });
});

describe("relationship-review findings", () => {
  it("reports one explicit client-to-database connection with typed evidence", () => {
    const graph = graphWith(
      ["db", "client"],
      [{ id: "direct", source: "client", target: "db", kind: "data-access" }],
      { client: "Web Client", db: "Orders Database" },
      { client: "client", db: "database" },
    );
    const analysis = analyzeArchitecture(graph);
    expect(analysis.findings).toEqual([
      {
        key: '["client-database-connection","direct"]',
        ruleId: "client-database-connection",
        category: "relationship-review",
        referencedComponentIds: ["client", "db"],
        referencedConnectionIds: ["direct"],
        evidence: {
          sourceComponentId: "client",
          targetComponentId: "db",
          connectionId: "direct",
          sourceKind: "client",
          targetKind: "database",
          connectionKind: "data-access",
        },
      },
    ]);
    expect(describeArchitectureFinding(analysis.findings[0], graph)).toEqual({
      message: "Web Client connects directly to Orders Database in this diagram.",
      reviewQuestion: "Is direct access intentional, and where is access control enforced?",
    });
    expectValidReferences(graph, analysis.findings);
  });

  it("does not infer client-to-database access from a reversed edge or an indirect path", () => {
    const kinds = { client: "client", service: "service", db: "database" } as const;
    const reversed = graphWith(
      ["client", "db"],
      [{ id: "back", source: "db", target: "client" }],
      {},
      kinds,
    );
    const indirect = graphWith(
      ["client", "service", "db"],
      [
        { id: "to-service", source: "client", target: "service" },
        { id: "to-db", source: "service", target: "db" },
      ],
      {},
      kinds,
    );
    expect(analyzeArchitecture(reversed).findings).toEqual([]);
    expect(analyzeArchitecture(indirect).findings).toEqual([]);
  });

  it("reports each direct client-to-database edge in canonical connection order", () => {
    const edges: TestConnection[] = [
      { id: "z-edge", source: "first-client", target: "first-db" },
      { id: "a-edge", source: "second-client", target: "second-db" },
    ];
    const kinds = {
      "first-client": "client",
      "second-client": "client",
      "first-db": "database",
      "second-db": "database",
    } as const;
    const first = graphWith(Object.keys(kinds), edges, {}, kinds);
    const second = graphWith(Object.keys(kinds).reverse(), [...edges].reverse(), {}, kinds);
    const firstAnalysis = analyzeArchitecture(first);
    expect(firstAnalysis).toEqual(analyzeArchitecture(second));
    expect(firstAnalysis.findings.map(({ ruleId }) => ruleId)).toEqual([
      "disconnected-structure",
      "client-database-connection",
      "client-database-connection",
    ]);
    expect(firstAnalysis.findings.slice(1).map(({ referencedConnectionIds }) => referencedConnectionIds)).toEqual([
      ["a-edge"],
      ["z-edge"],
    ]);
  });

  it.each([
    "generic",
    "request-response",
    "async-messaging",
    "streaming",
    "data-access",
  ] as const)("observes a direct client-to-database edge of kind %s", (kind) => {
    const graph = graphWith(
      ["client", "db"],
      [{ id: "direct", source: "client", target: "db", kind }],
      {},
      { client: "client", db: "database" },
    );
    const findings = analyzeArchitecture(graph).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "client-database-connection",
      evidence: { connectionKind: kind },
    });
  });

  it("disambiguates duplicate visible names with stable IDs in factual wording", () => {
    const graph = graphWith(
      ["db", "client"],
      [{ id: "direct", source: "client", target: "db" }],
      { client: "Shared", db: "Shared" },
      { client: "client", db: "database" },
    );
    const finding = analyzeArchitecture(graph).findings[0];
    expect(describeArchitectureFinding(finding, graph)).toEqual({
      message: "Shared (client) connects directly to Shared (db) in this diagram.",
      reviewQuestion: "Is direct access intentional, and where is access control enforced?",
    });
    expect(finding.key).not.toContain("Shared");
  });

  it("keeps client-to-database identity stable while formatting the current name", () => {
    const graph = graphWith(
      ["client", "db"],
      [{ id: "direct", source: "client", target: "db" }],
      { client: "Old Client", db: "Database" },
      { client: "client", db: "database" },
    );
    const rename = graph.renameComponent(componentId("client"), "New Client");
    if (!rename.ok) throw new Error("Expected valid rename");
    const before = analyzeArchitecture(graph).findings[0];
    const after = analyzeArchitecture(rename.graph).findings[0];
    expect(after.key).toBe(before.key);
    expect(after.evidence).toEqual(before.evidence);
    expect(describeArchitectureFinding(before, graph).message).toContain("Old Client");
    expect(describeArchitectureFinding(after, rename.graph).message).toContain("New Client");
  });

  it("reports one review for two opposite request-response connections", () => {
    const graph = graphWith(
      ["b", "a"],
      [
        { id: "ba", source: "b", target: "a", kind: "request-response" },
        { id: "ab", source: "a", target: "b", kind: "request-response" },
      ],
      { a: "API", b: "Worker" },
    );
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary.reciprocalPairCount).toBe(1);
    expect(analysis.findings.map(({ ruleId }) => ruleId)).toEqual([
      "directed-cyclic-region",
      "reciprocal-request-response",
    ]);
    expect(analysis.findings[1]).toEqual({
      key: '["reciprocal-request-response","ab","ba"]',
      ruleId: "reciprocal-request-response",
      category: "relationship-review",
      referencedComponentIds: ["a", "b"],
      referencedConnectionIds: ["ab", "ba"],
      evidence: {
        firstComponentId: "a",
        secondComponentId: "b",
        firstToSecondConnectionId: "ab",
        secondToFirstConnectionId: "ba",
        firstToSecondKind: "request-response",
        secondToFirstKind: "request-response",
      },
    });
    expect(describeArchitectureFinding(analysis.findings[1], graph)).toEqual({
      message: "API and Worker each have a request/response connection to the other.",
      reviewQuestion: "Do these represent separately initiated interactions, or the request and response of one interaction?",
    });
    expectValidReferences(graph, analysis.findings);
  });

  it("keeps reciprocal review ordering and identity independent of insertion order", () => {
    const edges: TestConnection[] = [
      { id: "z-forward", source: "a", target: "b", kind: "request-response" },
      { id: "a-reverse", source: "b", target: "a", kind: "request-response" },
      { id: "m-forward", source: "c", target: "d", kind: "request-response" },
      { id: "n-reverse", source: "d", target: "c", kind: "request-response" },
    ];
    const first = analyzeArchitecture(graphWith(["d", "b", "c", "a"], edges));
    const second = analyzeArchitecture(
      graphWith(["a", "c", "b", "d"], [...edges].reverse()),
    );
    expect(first).toEqual(second);
    expect(first.findings.map(({ ruleId }) => ruleId)).toEqual([
      "disconnected-structure",
      "directed-cyclic-region",
      "directed-cyclic-region",
      "reciprocal-request-response",
      "reciprocal-request-response",
    ]);
    expect(first.findings.slice(3).map(({ referencedComponentIds }) => referencedComponentIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(first.findings[3].referencedConnectionIds).toEqual(["a-reverse", "z-forward"]);
  });

  it("disambiguates reciprocal endpoints and preserves the key across a rename", () => {
    const graph = graphWith(
      ["a", "b"],
      [
        { id: "ab", source: "a", target: "b", kind: "request-response" },
        { id: "ba", source: "b", target: "a", kind: "request-response" },
      ],
      { a: "API", b: "API" },
    );
    const before = analyzeArchitecture(graph).findings[1];
    expect(describeArchitectureFinding(before, graph).message).toBe(
      "API (a) and API (b) each have a request/response connection to the other.",
    );
    const rename = graph.renameComponent(componentId("a"), "Gateway");
    if (!rename.ok) throw new Error("Expected valid rename");
    const after = analyzeArchitecture(rename.graph).findings[1];
    expect(after.key).toBe(before.key);
    expect(describeArchitectureFinding(after, rename.graph).message).toBe(
      "Gateway and API each have a request/response connection to the other.",
    );
  });

  it.each([
    {
      name: "request-response and async messaging",
      forward: "request-response",
      reverse: "async-messaging",
    },
    {
      name: "request-response and generic",
      forward: "request-response",
      reverse: "generic",
    },
    {
      name: "request-response without a reverse",
      forward: "request-response",
      reverse: null,
    },
    {
      name: "reciprocal async messaging",
      forward: "async-messaging",
      reverse: "async-messaging",
    },
    {
      name: "reciprocal generic",
      forward: "generic",
      reverse: "generic",
    },
  ] as const)("does not review $name as reciprocal request-response", ({ forward, reverse }) => {
    const edges: TestConnection[] = [
      { id: "ab", source: "a", target: "b", kind: forward },
    ];
    if (reverse !== null) {
      edges.push({ id: "ba", source: "b", target: "a", kind: reverse });
    }
    const analysis = analyzeArchitecture(graphWith(["a", "b"], edges));
    expect(analysis.findings.some(({ ruleId }) => ruleId === "reciprocal-request-response")).toBe(false);
    expect(analysis.summary.reciprocalPairCount).toBe(reverse === null ? 0 : 1);
    expect(analysis.findings.map(({ ruleId }) => ruleId)).toEqual(
      reverse === null ? [] : ["directed-cyclic-region"],
    );
  });

  it("keeps the 100-node reciprocal fixture bounded with semantic reviews", () => {
    const ids = Array.from({ length: 100 }, (_, index) => `node-${String(index).padStart(3, "0")}`);
    const edges: TestConnection[] = [];
    for (let index = 0; index < ids.length - 1; index += 1) {
      edges.push(
        { id: `forward-${index}`, source: ids[index], target: ids[index + 1], kind: "request-response" },
        { id: `reverse-${index}`, source: ids[index + 1], target: ids[index], kind: "request-response" },
      );
    }
    const graph = graphWith(ids, edges);
    const analysis = analyzeArchitecture(graph);
    expect(analysis.summary.reciprocalPairCount).toBe(99);
    expect(analysis.findings.map(({ ruleId }) => ruleId)).toEqual([
      "directed-cyclic-region",
      ...Array.from({ length: 99 }, () => "reciprocal-request-response"),
    ]);
    expectValidReferences(graph, analysis.findings);
    expect(graph.getConnections()).toHaveLength(198);
  });
});
