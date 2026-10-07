import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";

import { parseArchitectureReviewRequest } from "./architecture-review-request";

const brief = {
  title: "Checkout",
  requirementsAndConstraints: "Record paid orders.",
  assumptionsAndOpenQuestions: "Peak traffic is unknown.",
  decisionsAndTradeoffs: "Use a queue for fulfillment.",
};

function request() {
  return {
    version: 1,
    graph: {
      components: [
        { id: "client", name: "Client", kind: "client" },
        { id: "api", name: "API", kind: "service" },
        { id: "db", name: "Database", kind: "database" },
      ],
      connections: [
        { id: "c1", sourceComponentId: "client", targetComponentId: "api", kind: "request-response" },
        { id: "c2", sourceComponentId: "api", targetComponentId: "db", kind: "data-access" },
      ],
      boundaries: [
        { id: "b1", name: "Core", memberComponentIds: ["api", "db"] },
        { id: "b2", name: "Future", memberComponentIds: [] },
      ],
    },
    designContext: { ...brief },
  };
}

describe("review request admission and public domain replay", () => {
  it("keeps the frozen ten-case evaluation inputs valid without calling a provider", () => {
    const fixtures = JSON.parse(readFileSync(new URL("../../docs/evaluations/grounded-review-v1-fixtures.json", import.meta.url), "utf8")) as { caseId: string; request: unknown }[];
    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map(({ caseId }) => caseId)).size).toBe(10);
    for (const fixture of fixtures) expect(parseArchitectureReviewRequest(fixture.request)).toMatchObject({ ok: true });
  });
  it("reconstructs the exact canonical graph and DesignContext", () => {
    const result = parseArchitectureReviewRequest(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.graph.getComponents()).toHaveLength(3);
    expect(result.request.graph.getConnections().map(({ kind }) => kind)).toEqual(["request-response", "data-access"]);
    expect(result.request.graph.getBoundaries().map(({ memberComponentIds }) => memberComponentIds)).toEqual([["api", "db"], []]);
    expect(result.request.designContext).toEqual(brief);
  });

  it("admits exactly one component, 200 connections and 100 boundaries", () => {
    const one = request();
    one.graph.components = [one.graph.components[0]];
    one.graph.connections = [];
    one.graph.boundaries = [];
    expect(parseArchitectureReviewRequest(one).ok).toBe(true);
    const many = request();
    many.graph.components = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, kind: "service" }));
    many.graph.connections = [];
    for (let source = 0; source < 16 && many.graph.connections.length < 200; source++) {
      for (let target = 0; target < 16 && many.graph.connections.length < 200; target++) {
        if (source === target) continue;
        many.graph.connections.push({ id: `e${many.graph.connections.length}`, sourceComponentId: `n${source}`, targetComponentId: `n${target}`, kind: "generic" });
      }
    }
    many.graph.boundaries = Array.from({ length: 100 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, memberComponentIds: [] }));
    expect(parseArchitectureReviewRequest(many).ok).toBe(true);
    many.graph.connections.push({ id: "extra", sourceComponentId: "n15", targetComponentId: "n14", kind: "generic" });
    expect(parseArchitectureReviewRequest(many)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded" } });
    many.graph.connections.pop();
    many.graph.boundaries.push({ id: "extra", name: "Extra", memberComponentIds: [] });
    expect(parseArchitectureReviewRequest(many)).toMatchObject({ ok: false, error: { type: "review-limit-exceeded" } });
  });

  it.each([
    ["zero components", (value: ReturnType<typeof request>) => { value.graph.components = []; }, "empty-architecture"],
    ["too many components", (value: ReturnType<typeof request>) => { value.graph.components = Array.from({ length: 101 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, kind: "service" })); }, "review-limit-exceeded"],
    ["invalid component kind", (value: ReturnType<typeof request>) => { value.graph.components[0].kind = "router"; }, "invalid-request"],
    ["blank component", (value: ReturnType<typeof request>) => { value.graph.components[0].name = "  "; }, "invalid-request"],
    ["duplicate component", (value: ReturnType<typeof request>) => { value.graph.components[1].id = "client"; }, "invalid-request"],
    ["long component ID", (value: ReturnType<typeof request>) => { value.graph.components[0].id = "x".repeat(129); }, "review-limit-exceeded"],
    ["long component name", (value: ReturnType<typeof request>) => { value.graph.components[0].name = "x".repeat(201); }, "review-limit-exceeded"],
    ["invalid connection kind", (value: ReturnType<typeof request>) => { value.graph.connections[0].kind = "magic"; }, "invalid-request"],
    ["missing endpoint", (value: ReturnType<typeof request>) => { value.graph.connections[0].targetComponentId = "missing"; }, "invalid-request"],
    ["duplicate ordered pair", (value: ReturnType<typeof request>) => { value.graph.connections[1].sourceComponentId = "client"; value.graph.connections[1].targetComponentId = "api"; }, "invalid-request"],
    ["blank boundary", (value: ReturnType<typeof request>) => { value.graph.boundaries[0].name = " "; }, "invalid-request"],
    ["missing member", (value: ReturnType<typeof request>) => { value.graph.boundaries[0].memberComponentIds = ["missing"]; }, "invalid-request"],
    ["duplicate member", (value: ReturnType<typeof request>) => { value.graph.boundaries[0].memberComponentIds = ["api", "api"]; }, "invalid-request"],
    ["overlap", (value: ReturnType<typeof request>) => { value.graph.boundaries[1].memberComponentIds = ["api"]; }, "invalid-request"],
    ["invalid brief", (value: ReturnType<typeof request>) => { value.designContext.title = "x".repeat(121); }, "invalid-context"],
  ] as const)("rejects %s", (_label, mutate, expected) => {
    const input = request();
    mutate(input);
    expect(parseArchitectureReviewRequest(input)).toMatchObject({ ok: false, error: { type: expected } });
  });

  it("rejects wrong version, unknown fields and transient client state", () => {
    for (const input of [
      { ...request(), version: 2 },
      { ...request(), analysis: { findings: [] } },
      { ...request(), graph: { ...request().graph, positions: {} } },
      { ...request(), viewport: { x: 0, y: 0, zoom: 1 } },
      { ...request(), graph: { ...request().graph, components: [{ ...request().graph.components[0], measured: { width: 10 } }] } },
    ]) expect(parseArchitectureReviewRequest(input)).toMatchObject({ ok: false, error: { type: "invalid-request" } });
  });
});
