import "server-only";

import { REVIEW_CONTRACT_VERSION, REVIEW_LIMITS, reviewFailure, type ArchitectureReviewFailure } from "../application/architecture-review/architecture-review";
import { validateDesignContext, type DesignContext } from "../application/design-context";
import { ArchitectureGraph } from "../domain/architecture-graph";
import { isArchitectureComponentKind } from "../domain/architecture-component";
import { isArchitectureConnectionKind } from "../domain/architecture-connection";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";

export const ARCHITECTURE_REVIEW_REQUEST_VERSION = REVIEW_CONTRACT_VERSION;

export type ParsedReviewRequest = Readonly<{ graph: ArchitectureGraph; designContext: DesignContext }>;
export type ParseReviewRequestResult =
  | Readonly<{ ok: true; request: ParsedReviewRequest }>
  | Readonly<{ ok: false; error: ArchitectureReviewFailure }>;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) return;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some((key) => !Object.hasOwn(descriptors[key], "value"))) return;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function denseArray(value: unknown, maximum: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maximum && Object.keys(value).length === value.length &&
    value.every((_, index) => Object.hasOwn(value, index));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= REVIEW_LIMITS.entityId;
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= REVIEW_LIMITS.name;
}

/** Strict request admission; replay through domain operations rather than trusting JSON as a graph. */
export function parseArchitectureReviewRequest(input: unknown): ParseReviewRequestResult {
  const invalid = (): ParseReviewRequestResult => ({ ok: false, error: reviewFailure("invalid-request") });
  const limit = (detail: string): ParseReviewRequestResult => ({ ok: false, error: reviewFailure("review-limit-exceeded", detail) });
  const root = exactRecord(input, ["version", "graph", "designContext"]);
  if (!root || root.version !== ARCHITECTURE_REVIEW_REQUEST_VERSION) return invalid();
  const rawGraph = exactRecord(root.graph, ["components", "connections", "boundaries"]);
  if (!rawGraph) return invalid();
  if (!denseArray(rawGraph.components, REVIEW_LIMITS.components)) {
    return Array.isArray(rawGraph.components) && rawGraph.components.length > REVIEW_LIMITS.components ? limit("components: maximum 100") : invalid();
  }
  if (rawGraph.components.length === 0) return { ok: false, error: reviewFailure("empty-architecture") };
  if (!denseArray(rawGraph.connections, REVIEW_LIMITS.connections)) {
    return Array.isArray(rawGraph.connections) && rawGraph.connections.length > REVIEW_LIMITS.connections ? limit("connections: maximum 200") : invalid();
  }
  if (!denseArray(rawGraph.boundaries, REVIEW_LIMITS.boundaries)) {
    return Array.isArray(rawGraph.boundaries) && rawGraph.boundaries.length > REVIEW_LIMITS.boundaries ? limit("boundaries: maximum 100") : invalid();
  }
  const validatedContext = validateDesignContext(root.designContext);
  if (!validatedContext.ok) return { ok: false, error: reviewFailure("invalid-context") };

  let graph = ArchitectureGraph.empty();
  for (const value of rawGraph.components) {
    const component = exactRecord(value, ["id", "name", "kind"]);
    if (!component) return invalid();
    if (typeof component.id === "string" && component.id.length > REVIEW_LIMITS.entityId) return limit("component ID: maximum 128");
    if (typeof component.name === "string" && component.name.length > REVIEW_LIMITS.name) return limit("component name: maximum 200");
    if (!validId(component.id) || !validName(component.name) || !isArchitectureComponentKind(component.kind)) return invalid();
    const added = graph.addComponent({ id: component.id as ComponentId, name: component.name, kind: component.kind });
    if (!added.ok) return invalid();
    graph = added.graph;
  }
  for (const value of rawGraph.connections) {
    const connection = exactRecord(value, ["id", "sourceComponentId", "targetComponentId", "kind"]);
    if (!connection) return invalid();
    if ([connection.id, connection.sourceComponentId, connection.targetComponentId].some((id) => typeof id === "string" && id.length > REVIEW_LIMITS.entityId)) return limit("connection ID or endpoint: maximum 128");
    if (!validId(connection.id) || !validId(connection.sourceComponentId) || !validId(connection.targetComponentId) || !isArchitectureConnectionKind(connection.kind)) return invalid();
    const added = graph.addConnection({
      id: connection.id as ConnectionId,
      sourceComponentId: connection.sourceComponentId as ComponentId,
      targetComponentId: connection.targetComponentId as ComponentId,
      kind: connection.kind,
    });
    if (!added.ok) return invalid();
    graph = added.graph;
  }
  for (const value of rawGraph.boundaries) {
    const boundary = exactRecord(value, ["id", "name", "memberComponentIds"]);
    if (!boundary) return invalid();
    if (typeof boundary.id === "string" && boundary.id.length > REVIEW_LIMITS.entityId) return limit("boundary ID: maximum 128");
    if (typeof boundary.name === "string" && boundary.name.length > REVIEW_LIMITS.name) return limit("boundary name: maximum 200");
    if (!validId(boundary.id) || !validName(boundary.name) || !denseArray(boundary.memberComponentIds, REVIEW_LIMITS.components)) return invalid();
    if (boundary.memberComponentIds.some((id) => typeof id === "string" && id.length > REVIEW_LIMITS.entityId)) return limit("boundary member ID: maximum 128");
    if (!boundary.memberComponentIds.every(validId)) return invalid();
    const added = graph.addBoundary({
      id: boundary.id as BoundaryId,
      name: boundary.name,
      memberComponentIds: boundary.memberComponentIds as ComponentId[],
    });
    if (!added.ok) return invalid();
    graph = added.graph;
  }
  return { ok: true, request: { graph, designContext: validatedContext.context } };
}
