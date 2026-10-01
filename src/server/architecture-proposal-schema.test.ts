import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { architectureProposalSchema as schema } from "./architecture-proposal-schema";
import { ARCHITECTURE_PROPOSAL_LIMITS as limits, parseArchitectureProposal } from "../application/architecture-proposal";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { ARCHITECTURE_COMPONENT_KINDS } from "../domain/architecture-component";
import { ARCHITECTURE_CONNECTION_KINDS } from "../domain/architecture-connection";

const component = schema.properties.components.items;
const connection = schema.properties.connections.items;

describe("Structured Output schema and authoritative parser contract", () => {
  it.each([
    [schema, minimalProposal(), (value: unknown) => value],
    [component, minimalProposal().components[0], (value: unknown) => ({ ...minimalProposal(), components: [value], connections: [] })],
    [connection, minimalProposal().connections[0], (value: unknown) => ({ ...minimalProposal(), connections: [value] })],
  ])("requires exact fields and forbids extra properties at object level %#", (objectSchema, fixture, wrap) => {
    expect(objectSchema.additionalProperties).toBe(false);
    expect(objectSchema.required).toEqual(Object.keys(objectSchema.properties));
    expect(objectSchema.required).toEqual(Object.keys(fixture));
    for (const key of objectSchema.required) {
      const missing: Record<string, unknown> = { ...fixture };
      delete missing[key];
      expect(parseArchitectureProposal(wrap(missing)).ok).toBe(false);
    }
    expect(parseArchitectureProposal(wrap({ ...fixture, unexpected: true })).ok).toBe(false);
    expect(parseArchitectureProposal(wrap(fixture)).ok).toBe(true);
  });

  it("uses precisely the canonical component and connection enums accepted by the parser", () => {
    expect(component.properties.kind.enum).toEqual([...ARCHITECTURE_COMPONENT_KINDS]);
    expect(connection.properties.kind.enum).toEqual([...ARCHITECTURE_CONNECTION_KINDS]);
    for (const kind of component.properties.kind.enum) {
      expect(parseArchitectureProposal({ ...minimalProposal(), components: [{ ref: "a", name: "A", kind }], connections: [] }).ok).toBe(true);
    }
    for (const kind of connection.properties.kind.enum) {
      expect(parseArchitectureProposal({ ...minimalProposal(), connections: [{ sourceRef: "client", targetRef: "api", kind }] }).ok).toBe(true);
    }
    expect(parseArchitectureProposal({ ...minimalProposal(), components: [{ ref: "a", name: "A", kind: "unsupported" }], connections: [] }).ok).toBe(false);
    expect(parseArchitectureProposal({ ...minimalProposal(), connections: [{ sourceRef: "client", targetRef: "api", kind: "unsupported" }] }).ok).toBe(false);
  });

  it("aligns array minima and maxima with parser acceptance", () => {
    expect(schema.properties.components.minItems).toBe(1);
    expect(schema.properties.connections.minItems).toBe(0);
    expect(schema.properties.assumptions.minItems).toBe(0);
    expect(schema.properties.components.maxItems).toBe(limits.components);
    expect(schema.properties.connections.maxItems).toBe(limits.connections);
    expect(schema.properties.assumptions.maxItems).toBe(limits.assumptions);
    const components = Array.from({ length: limits.components }, (_, i) => ({ ref: `c${i}`, name: `Component ${i}`, kind: "service" }));
    const connections = components.flatMap((source) => components.filter((target) => source !== target).map((target) => ({ sourceRef: source.ref, targetRef: target.ref, kind: "generic" }))).slice(0, limits.connections);
    const atBounds = { ...minimalProposal(), components, connections, assumptions: Array(limits.assumptions).fill("Assumption") };
    expect(parseArchitectureProposal(atBounds).ok).toBe(true);
    expect(parseArchitectureProposal({ ...atBounds, components: [...components, { ref: "extra", name: "Extra", kind: "service" }] })).toMatchObject({ ok: false, error: { type: "limit-exceeded", path: ["components"] } });
    expect(parseArchitectureProposal({ ...atBounds, connections: [...connections, { sourceRef: "c29", targetRef: "c0", kind: "generic" }] })).toMatchObject({ ok: false, error: { type: "limit-exceeded", path: ["connections"] } });
    expect(parseArchitectureProposal({ ...atBounds, assumptions: [...atBounds.assumptions, "Extra"] })).toMatchObject({ ok: false, error: { type: "limit-exceeded", path: ["assumptions"] } });
    expect(parseArchitectureProposal({ ...minimalProposal(), components: [], connections: [] }).ok).toBe(false);
    expect(parseArchitectureProposal({ ...minimalProposal(), connections: [], assumptions: [] }).ok).toBe(true);
  });

  const textCases = [
    [component.properties.ref, limits.ref, (text: string) => ({ ...minimalProposal(), components: [{ ref: text, name: "A", kind: "generic" }], connections: [] })],
    [component.properties.name, limits.componentName, (text: string) => ({ ...minimalProposal(), components: [{ ref: "a", name: text, kind: "generic" }], connections: [] })],
    [connection.properties.sourceRef, limits.ref, (text: string) => ({ ...minimalProposal(), components: [{ ref: text, name: "A", kind: "generic" }, { ref: "b", name: "B", kind: "generic" }], connections: [{ sourceRef: text, targetRef: "b", kind: "generic" }] })],
    [connection.properties.targetRef, limits.ref, (text: string) => ({ ...minimalProposal(), components: [{ ref: text, name: "A", kind: "generic" }, { ref: "b", name: "B", kind: "generic" }], connections: [{ sourceRef: "b", targetRef: text, kind: "generic" }] })],
    [schema.properties.summary, limits.summary, (text: string) => ({ ...minimalProposal(), summary: text })],
    [schema.properties.assumptions.items, limits.assumption, (text: string) => ({ ...minimalProposal(), assumptions: [text] })],
  ] as const;
  it.each(textCases)("aligns string bounds %# and preserves stricter UTF-16 admission", (textSchema, limit, proposal) => {
    expect(textSchema.minLength).toBe(1);
    expect(textSchema.maxLength).toBe(limit);
    expect(parseArchitectureProposal(proposal("a".repeat(limit))).ok).toBe(true);
    expect(parseArchitectureProposal(proposal("a".repeat(limit + 1))).ok).toBe(false);
    expect(parseArchitectureProposal(proposal("" )).ok).toBe(false);
    expect(parseArchitectureProposal(proposal(" ")).ok).toBe(false);
    expect(parseArchitectureProposal(proposal("😀".repeat(limit))).ok).toBe(false);
  });
});
