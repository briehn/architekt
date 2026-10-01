import {
  isArchitectureComponentKind,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import {
  isArchitectureConnectionKind,
  type ArchitectureConnectionKind,
} from "../domain/architecture-connection";

// Review-sized systems, below the editor's tested ~100 nodes / 200 edges.
// String bounds use UTF-16 code units and apply before whitespace trimming.
export const ARCHITECTURE_PROPOSAL_LIMITS = Object.freeze({
  components: 30,
  connections: 60,
  componentName: 100,
  ref: 64,
  summary: 1000,
  assumptions: 10,
  assumption: 300,
});

export type ProposedArchitectureComponent = Readonly<{
  ref: string;
  name: string;
  kind: ArchitectureComponentKind;
}>;

export type ProposedArchitectureConnection = Readonly<{
  sourceRef: string;
  targetRef: string;
  kind: ArchitectureConnectionKind;
}>;

export type ArchitectureProposalReview = Readonly<{
  summary: string;
  assumptions: readonly string[];
}>;

export type ArchitectureProposal = ArchitectureProposalReview &
  Readonly<{
    components: readonly ProposedArchitectureComponent[];
    connections: readonly ProposedArchitectureConnection[];
  }>;

type ProposalPath = readonly (string | number)[];

export type ArchitectureProposalParseError =
  | {
      type: "invalid-shape";
      path: ProposalPath;
      reason:
        | "expected-object"
        | "unexpected-fields"
        | "missing-fields"
        | "expected-data-fields"
        | "expected-array"
        | "expected-string"
        | "empty-string"
        | "empty-components";
    }
  | { type: "limit-exceeded"; path: ProposalPath; limit: number; actual: number }
  | { type: "duplicate-component-ref"; path: ProposalPath; ref: string }
  | {
      type: "unknown-component-kind" | "unknown-connection-kind";
      path: ProposalPath;
    }
  | { type: "missing-endpoint-reference"; path: ProposalPath; ref: string }
  | { type: "self-connection"; path: ProposalPath; ref: string }
  | {
      type: "duplicate-ordered-connection";
      path: ProposalPath;
      sourceRef: string;
      targetRef: string;
    };

type ParseResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: ArchitectureProposalParseError };

export type ArchitectureProposalParseResult =
  | { ok: true; proposal: ArchitectureProposal }
  | { ok: false; error: ArchitectureProposalParseError };

function invalidShape(
  path: ProposalPath,
  reason: Extract<
    ArchitectureProposalParseError,
    { type: "invalid-shape" }
  >["reason"],
): { ok: false; error: ArchitectureProposalParseError } {
  return { ok: false, error: { type: "invalid-shape", path, reason } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(
  input: unknown,
  keys: readonly string[],
  path: ProposalPath,
): ParseResult<Record<string, unknown>> {
  if (!isRecord(input)) return invalidShape(path, "expected-object");

  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidShape(path, "expected-object");
  }

  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    return invalidShape(path, "unexpected-fields");
  }
  if (ownKeys.length !== keys.length) return invalidShape(path, "missing-fields");

  // The boundary accepts plain data, not accessor-backed application objects.
  if (keys.some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor === undefined || !Object.hasOwn(descriptor, "value");
  })) {
    return invalidShape(path, "expected-data-fields");
  }
  return { ok: true, value: input };
}

function parseArray(
  input: unknown,
  limit: number,
  path: ProposalPath,
): ParseResult<readonly unknown[]> {
  if (!Array.isArray(input)) return invalidShape(path, "expected-array");
  if (input.length > limit) {
    return {
      ok: false,
      error: { type: "limit-exceeded", path, limit, actual: input.length },
    };
  }
  return { ok: true, value: input };
}

function parseText(
  input: unknown,
  limit: number,
  path: ProposalPath,
): ParseResult<string> {
  if (typeof input !== "string") return invalidShape(path, "expected-string");
  if (input.length > limit) {
    return {
      ok: false,
      error: { type: "limit-exceeded", path, limit, actual: input.length },
    };
  }
  if (input.trim().length === 0) return invalidShape(path, "empty-string");
  return { ok: true, value: input };
}

/**
 * The shared trust boundary for untrusted proposal data. Extra fields are rejected,
 * including canonical IDs and renderer/persistence metadata. Names and review text
 * are trimmed; refs remain exact, case-sensitive local identifiers. They are never
 * interpreted as code or fetched as URLs.
 * Text is inert data: eventual consumers must display it as text, never execute it.
 */
export function parseArchitectureProposal(
  input: unknown,
): ArchitectureProposalParseResult {
  const record = parseRecord(
    input,
    ["components", "connections", "summary", "assumptions"],
    [],
  );
  if (!record.ok) return record;

  const componentEntries = parseArray(
    record.value.components,
    ARCHITECTURE_PROPOSAL_LIMITS.components,
    ["components"],
  );
  if (!componentEntries.ok) return componentEntries;
  if (componentEntries.value.length === 0) {
    return invalidShape(["components"], "empty-components");
  }

  const connectionEntries = parseArray(
    record.value.connections,
    ARCHITECTURE_PROPOSAL_LIMITS.connections,
    ["connections"],
  );
  if (!connectionEntries.ok) return connectionEntries;
  const assumptionEntries = parseArray(
    record.value.assumptions,
    ARCHITECTURE_PROPOSAL_LIMITS.assumptions,
    ["assumptions"],
  );
  if (!assumptionEntries.ok) return assumptionEntries;
  const summary = parseText(
    record.value.summary,
    ARCHITECTURE_PROPOSAL_LIMITS.summary,
    ["summary"],
  );
  if (!summary.ok) return summary;

  const components: ProposedArchitectureComponent[] = [];
  for (const [index, entry] of componentEntries.value.entries()) {
    const path = ["components", index];
    const component = parseRecord(entry, ["ref", "name", "kind"], path);
    if (!component.ok) return component;
    const ref = parseText(
      component.value.ref,
      ARCHITECTURE_PROPOSAL_LIMITS.ref,
      [...path, "ref"],
    );
    if (!ref.ok) return ref;
    const name = parseText(
      component.value.name,
      ARCHITECTURE_PROPOSAL_LIMITS.componentName,
      [...path, "name"],
    );
    if (!name.ok) return name;
    if (!isArchitectureComponentKind(component.value.kind)) {
      return {
        ok: false,
        error: { type: "unknown-component-kind", path: [...path, "kind"] },
      };
    }
    components.push({
      ref: ref.value,
      name: name.value.trim(),
      kind: component.value.kind,
    });
  }

  const connections: ProposedArchitectureConnection[] = [];
  for (const [index, entry] of connectionEntries.value.entries()) {
    const path = ["connections", index];
    const connection = parseRecord(entry, ["sourceRef", "targetRef", "kind"], path);
    if (!connection.ok) return connection;
    const source = parseText(
      connection.value.sourceRef,
      ARCHITECTURE_PROPOSAL_LIMITS.ref,
      [...path, "sourceRef"],
    );
    if (!source.ok) return source;
    const target = parseText(
      connection.value.targetRef,
      ARCHITECTURE_PROPOSAL_LIMITS.ref,
      [...path, "targetRef"],
    );
    if (!target.ok) return target;
    if (!isArchitectureConnectionKind(connection.value.kind)) {
      return {
        ok: false,
        error: { type: "unknown-connection-kind", path: [...path, "kind"] },
      };
    }
    connections.push({
      sourceRef: source.value,
      targetRef: target.value,
      kind: connection.value.kind,
    });
  }

  const assumptions: string[] = [];
  for (const [index, entry] of assumptionEntries.value.entries()) {
    const assumption = parseText(
      entry,
      ARCHITECTURE_PROPOSAL_LIMITS.assumption,
      ["assumptions", index],
    );
    if (!assumption.ok) return assumption;
    assumptions.push(assumption.value.trim());
  }

  // Semantic checks follow complete shape validation and precede all domain admission.
  const refs = new Set<string>();
  for (const [index, component] of components.entries()) {
    if (refs.has(component.ref)) {
      return {
        ok: false,
        error: {
          type: "duplicate-component-ref",
          path: ["components", index, "ref"],
          ref: component.ref,
        },
      };
    }
    refs.add(component.ref);
  }

  const targetsBySource = new Map<string, Set<string>>();
  for (const [index, connection] of connections.entries()) {
    const path = ["connections", index];
    for (const field of ["sourceRef", "targetRef"] as const) {
      if (!refs.has(connection[field])) {
        return {
          ok: false,
          error: {
            type: "missing-endpoint-reference",
            path: [...path, field],
            ref: connection[field],
          },
        };
      }
    }
    if (connection.sourceRef === connection.targetRef) {
      return {
        ok: false,
        error: { type: "self-connection", path, ref: connection.sourceRef },
      };
    }
    const targets = targetsBySource.get(connection.sourceRef) ?? new Set<string>();
    if (targets.has(connection.targetRef)) {
      return {
        ok: false,
        error: {
          type: "duplicate-ordered-connection",
          path,
          sourceRef: connection.sourceRef,
          targetRef: connection.targetRef,
        },
      };
    }
    targets.add(connection.targetRef);
    targetsBySource.set(connection.sourceRef, targets);
  }

  return {
    ok: true,
    proposal: { components, connections, summary: summary.value.trim(), assumptions },
  };
}
