import { describe, expect, it } from "vitest";

import { ARCHITECTURE_COMPONENT_KINDS } from "../domain/architecture-component";
import { ARCHITECTURE_CONNECTION_KINDS } from "../domain/architecture-connection";
import {
  ARCHITECTURE_PROPOSAL_LIMITS as limits,
  parseArchitectureProposal,
  type ArchitectureProposal,
} from "./architecture-proposal";
import { minimalProposal, representativeProposals } from "./__fixtures__/architecture-proposals";

function withComponent(fields: Record<string, unknown>): unknown {
  const proposal = minimalProposal();
  return { ...proposal, components: [{ ...proposal.components[0], ...fields }, ...proposal.components.slice(1)] };
}

function withConnection(fields: Record<string, unknown>): unknown {
  const proposal = minimalProposal();
  return { ...proposal, connections: [{ ...proposal.connections[0], ...fields }] };
}

describe("parseArchitectureProposal shape and vocabulary", () => {
  it.each(representativeProposals)("accepts the $name fixture", ({ create }) => {
    const proposal = create();
    expect(parseArchitectureProposal(proposal)).toEqual({ ok: true, proposal });
  });

  it.each([null, undefined, false, 42, "{}", [], new Date(), new Map()])(
    "rejects non-proposal input %s",
    (input) => expect(parseArchitectureProposal(input)).toMatchObject({
      ok: false, error: { type: "invalid-shape", path: [], reason: "expected-object" },
    }),
  );

  it.each(["components", "connections", "summary", "assumptions"])(
    "requires the %s field",
    (field) => {
      const input = Object.fromEntries(Object.entries(minimalProposal()).filter(([key]) => key !== field));
      expect(parseArchitectureProposal(input)).toMatchObject({
        ok: false, error: { type: "invalid-shape", reason: "missing-fields" },
      });
    },
  );

  it.each([
    ["canonical component ID", () => withComponent({ id: "provider-id" })],
    ["component coordinates", () => withComponent({ position: { x: 1, y: 2 } })],
    ["canonical connection ID", () => withConnection({ id: "provider-edge" })],
    ["renderer handles", () => withConnection({ sourceHandle: "anchor-right" })],
    ["persistence version", () => ({ ...minimalProposal(), schemaVersion: 3 })],
    ["viewport", () => ({ ...minimalProposal(), viewport: { x: 0, y: 0, zoom: 1 } })],
    ["selection", () => ({ ...minimalProposal(), selection: [] })],
    ["history", () => ({ ...minimalProposal(), history: {} })],
  ] as const)("rejects additional %s fields", (_, create) => {
    expect(parseArchitectureProposal(create())).toMatchObject({
      ok: false, error: { type: "invalid-shape", reason: "unexpected-fields" },
    });
  });

  it.each([
    ["component ref", () => withComponent({ ref: " \t" })],
    ["component name", () => withComponent({ name: "\n " })],
    ["source ref", () => withConnection({ sourceRef: "" })],
    ["target ref", () => withConnection({ targetRef: " " })],
    ["summary", () => ({ ...minimalProposal(), summary: "\t" })],
    ["assumption", () => ({ ...minimalProposal(), assumptions: [" "] })],
  ] as const)("rejects blank %s", (_, create) => {
    expect(parseArchitectureProposal(create())).toMatchObject({
      ok: false, error: { type: "invalid-shape", reason: "empty-string" },
    });
  });

  it.each([
    { ...minimalProposal(), components: {} },
    { ...minimalProposal(), connections: null },
    { ...minimalProposal(), assumptions: "none" },
    { ...minimalProposal(), summary: 42 },
    { ...minimalProposal(), components: [null] },
    { ...minimalProposal(), connections: [[]] },
    { ...minimalProposal(), assumptions: [null] },
    { ...minimalProposal(), components: [{ ref: "a", name: "A" }] },
    { ...minimalProposal(), connections: [{ sourceRef: "api", kind: "generic" }] },
    withComponent({ ref: 1 }),
    withComponent({ name: {} }),
    withConnection({ sourceRef: false }),
    withConnection({ targetRef: [] }),
  ])("rejects malformed nested data %#", (input) => {
    expect(parseArchitectureProposal(input)).toMatchObject({ ok: false, error: { type: "invalid-shape" } });
  });

  it("requires at least one component but permits no connections or assumptions", () => {
    expect(parseArchitectureProposal({ ...minimalProposal(), components: [] })).toMatchObject({
      ok: false, error: { type: "invalid-shape", path: ["components"], reason: "empty-components" },
    });
    expect(parseArchitectureProposal({
      ...minimalProposal(), components: [minimalProposal().components[0]], connections: [], assumptions: [],
    }).ok).toBe(true);
  });

  it.each(ARCHITECTURE_COMPONENT_KINDS)("accepts component kind %s", (kind) => {
    expect(parseArchitectureProposal(withComponent({ kind })).ok).toBe(true);
  });

  it.each(ARCHITECTURE_CONNECTION_KINDS)("accepts connection kind %s", (kind) => {
    expect(parseArchitectureProposal(withConnection({ kind })).ok).toBe(true);
  });

  it.each(["redis", "", null, 1, {}])("rejects unknown component kind %s", (kind) => {
    expect(parseArchitectureProposal(withComponent({ kind }))).toEqual({
      ok: false, error: { type: "unknown-component-kind", path: ["components", 0, "kind"] },
    });
  });

  it.each(["grpc", "", null, 1, {}])("rejects unknown connection kind %s", (kind) => {
    expect(parseArchitectureProposal(withConnection({ kind }))).toEqual({
      ok: false, error: { type: "unknown-connection-kind", path: ["connections", 0, "kind"] },
    });
  });

  it("rejects accessors without executing them", () => {
    let invoked = false;
    const input = { ...minimalProposal(), get summary() { invoked = true; return "Side effect"; } };
    expect(parseArchitectureProposal(input)).toMatchObject({
      ok: false, error: { type: "invalid-shape", reason: "expected-data-fields" },
    });
    expect(invoked).toBe(false);
  });

  it("requires own fields and rejects symbol extensions", () => {
    expect(parseArchitectureProposal(Object.create(minimalProposal())).ok).toBe(false);
    expect(parseArchitectureProposal({ ...minimalProposal(), [Symbol("extra")]: true })).toMatchObject({
      ok: false, error: { type: "invalid-shape", reason: "unexpected-fields" },
    });
  });
});

describe("parseArchitectureProposal bounds", () => {
  const oversizedCases = [
    { name: "components", create: () => ({ ...minimalProposal(), components: Array(limits.components + 1).fill(null) }), path: ["components"], limit: limits.components },
    { name: "connections", create: () => ({ ...minimalProposal(), connections: Array(limits.connections + 1).fill(null) }), path: ["connections"], limit: limits.connections },
    { name: "name", create: () => withComponent({ name: "a".repeat(limits.componentName + 1) }), path: ["components", 0, "name"], limit: limits.componentName },
    { name: "ref", create: () => withComponent({ ref: "a".repeat(limits.ref + 1) }), path: ["components", 0, "ref"], limit: limits.ref },
    { name: "source ref", create: () => withConnection({ sourceRef: "a".repeat(limits.ref + 1) }), path: ["connections", 0, "sourceRef"], limit: limits.ref },
    { name: "target ref", create: () => withConnection({ targetRef: "a".repeat(limits.ref + 1) }), path: ["connections", 0, "targetRef"], limit: limits.ref },
    { name: "summary", create: () => ({ ...minimalProposal(), summary: "a".repeat(limits.summary + 1) }), path: ["summary"], limit: limits.summary },
    { name: "assumptions", create: () => ({ ...minimalProposal(), assumptions: Array(limits.assumptions + 1).fill("A") }), path: ["assumptions"], limit: limits.assumptions },
    { name: "assumption", create: () => ({ ...minimalProposal(), assumptions: ["a".repeat(limits.assumption + 1)] }), path: ["assumptions", 0], limit: limits.assumption },
  ];

  it.each(oversizedCases)("rejects oversized $name with bounded evidence", ({ create, path, limit }) => {
    expect(parseArchitectureProposal(create())).toEqual({
      ok: false, error: { type: "limit-exceeded", path, limit, actual: limit + 1 },
    });
  });

  it("accepts every exact upper bound", () => {
    const components = Array.from({ length: limits.components }, (_, index) => ({
      ref: String(index).padStart(limits.ref, "r"), name: "N".repeat(limits.componentName), kind: "service" as const,
    }));
    const connections = components.flatMap((source) => components
      .filter((target) => target !== source)
      .map((target) => ({ sourceRef: source.ref, targetRef: target.ref, kind: "generic" as const })))
      .slice(0, limits.connections);
    const proposal = {
      components, connections, summary: "S".repeat(limits.summary),
      assumptions: Array(limits.assumptions).fill("A".repeat(limits.assumption)),
    };
    expect(parseArchitectureProposal(proposal)).toEqual({ ok: true, proposal });
  });

  it("bounds the original string before trimming", () => {
    expect(parseArchitectureProposal(withComponent({ name: " ".repeat(limits.componentName) + "A" })))
      .toMatchObject({ ok: false, error: { type: "limit-exceeded" } });
  });
});

describe("parseArchitectureProposal semantics and ownership", () => {
  it("rejects duplicate refs independently of names and kinds", () => {
    expect(parseArchitectureProposal(withComponent({ ref: "api" }))).toEqual({
      ok: false, error: { type: "duplicate-component-ref", path: ["components", 1, "ref"], ref: "api" },
    });
  });

  it.each(["sourceRef", "targetRef"] as const)("identifies the missing %s", (field) => {
    expect(parseArchitectureProposal(withConnection({ [field]: "missing" }))).toEqual({
      ok: false, error: { type: "missing-endpoint-reference", path: ["connections", 0, field], ref: "missing" },
    });
  });

  it("rejects a self-connection", () => {
    expect(parseArchitectureProposal(withConnection({ targetRef: "client" }))).toEqual({
      ok: false, error: { type: "self-connection", path: ["connections", 0], ref: "client" },
    });
  });

  it("rejects duplicate ordered pairs even with different kinds", () => {
    const proposal = minimalProposal();
    expect(parseArchitectureProposal({ ...proposal, connections: [proposal.connections[0], { ...proposal.connections[0], kind: "streaming" }] })).toEqual({
      ok: false, error: { type: "duplicate-ordered-connection", path: ["connections", 1], sourceRef: "client", targetRef: "api" },
    });
  });

  it("supports arbitrary exact refs without delimiter collisions or object-key semantics", () => {
    const refs = ["a->b", "c", "a", "b->c", "__proto__", "constructor", "API", "api", " api "];
    const proposal = {
      ...minimalProposal(), components: refs.map((ref) => ({ ref, name: "Duplicate name", kind: "generic" })),
      connections: [
        { sourceRef: "a->b", targetRef: "c", kind: "generic" },
        { sourceRef: "a", targetRef: "b->c", kind: "generic" },
        { sourceRef: "__proto__", targetRef: "constructor", kind: "generic" },
        { sourceRef: "API", targetRef: " api ", kind: "generic" },
      ],
    };
    expect(parseArchitectureProposal(proposal)).toEqual({ ok: true, proposal });
  });

  it("normalizes visible text, preserves inert content, and copies caller-owned data", () => {
    const input: ArchitectureProposal = {
      ...minimalProposal(),
      components: [{ ref: " api ", name: "  API  ", kind: "service" }],
      connections: [],
      summary: "  <script>doNothing()</script>  ",
      assumptions: ["  https://example.invalid is text only.  "],
    };
    const before = structuredClone(input);
    Object.freeze(input.components[0]);
    Object.freeze(input.components);
    Object.freeze(input.connections);
    Object.freeze(input.assumptions);
    Object.freeze(input);
    const result = parseArchitectureProposal(input);
    expect(input).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid proposal");
    expect(result.proposal).toEqual({
      components: [{ ref: " api ", name: "API", kind: "service" }], connections: [],
      summary: "<script>doNothing()</script>", assumptions: ["https://example.invalid is text only."],
    });
    expect(result.proposal.components).not.toBe(input.components);
    expect(result.proposal.components[0]).not.toBe(input.components[0]);
    expect(result.proposal.assumptions).not.toBe(input.assumptions);
  });
});
