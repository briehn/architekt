import type { ArchitectureComponent } from "../../domain/architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "../../domain/architecture-connection";
import { ArchitectureGraph } from "../../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../../domain/identifiers";

export type ComponentDegree = Readonly<{
  componentId: ComponentId;
  incoming: number;
  outgoing: number;
}>;

export type DirectedCycleWitness = Readonly<{
  // The first component appears again at the end to close the directed walk.
  componentIds: readonly ComponentId[];
  connectionIds: readonly ConnectionId[];
}>;

type FindingBase = Readonly<{
  key: string;
  referencedComponentIds: readonly ComponentId[];
  referencedConnectionIds: readonly ConnectionId[];
}>;

type StructuralFindingBase = FindingBase & Readonly<{ category: "structure" }>;
type RelationshipReviewFindingBase = FindingBase &
  Readonly<{ category: "relationship-review" }>;

export type ArchitectureFinding =
  | (StructuralFindingBase &
      Readonly<{
        ruleId: "isolated-components";
        evidence: Readonly<{ incoming: 0; outgoing: 0 }>;
      }>)
  | (StructuralFindingBase &
      Readonly<{
        ruleId: "disconnected-structure";
        evidence: Readonly<{ regions: readonly (readonly ComponentId[])[] }>;
      }>)
  | (StructuralFindingBase &
      Readonly<{
        ruleId: "directed-cyclic-region";
        evidence: Readonly<{
          memberComponentIds: readonly ComponentId[];
          internalConnectionIds: readonly ConnectionId[];
          witness: DirectedCycleWitness;
        }>;
      }>)
  | (RelationshipReviewFindingBase &
      Readonly<{
        ruleId: "client-database-connection";
        evidence: Readonly<{
          sourceComponentId: ComponentId;
          targetComponentId: ComponentId;
          connectionId: ConnectionId;
          sourceKind: "client";
          targetKind: "database";
          connectionKind: ArchitectureConnectionKind;
        }>;
      }>)
  | (RelationshipReviewFindingBase &
      Readonly<{
        ruleId: "reciprocal-request-response";
        evidence: Readonly<{
          firstComponentId: ComponentId;
          secondComponentId: ComponentId;
          firstToSecondConnectionId: ConnectionId;
          secondToFirstConnectionId: ConnectionId;
          firstToSecondKind: "request-response";
          secondToFirstKind: "request-response";
        }>;
      }>);

export type ArchitectureAnalysis = Readonly<{
  summary: Readonly<{
    componentCount: number;
    connectionCount: number;
    weaklyConnectedRegionCount: number;
    reciprocalPairCount: number;
  }>;
  componentDegrees: readonly ComponentDegree[];
  findings: readonly ArchitectureFinding[];
}>;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function findingKey(ruleId: ArchitectureFinding["ruleId"], ids: readonly string[]): string {
  return JSON.stringify([ruleId, ...ids]);
}

function weaklyConnectedRegions(
  componentIds: readonly ComponentId[],
  neighbors: ReadonlyMap<ComponentId, readonly ComponentId[]>,
): ComponentId[][] {
  const visited = new Set<ComponentId>();
  const regions: ComponentId[][] = [];

  for (const componentId of componentIds) {
    if (visited.has(componentId)) continue;

    const region: ComponentId[] = [];
    const pending = [componentId];
    visited.add(componentId);
    while (pending.length > 0) {
      const current = pending.pop()!;
      region.push(current);
      for (const neighbor of neighbors.get(current)!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    region.sort(compareIds);
    regions.push(region);
  }

  return regions.sort((left, right) => compareIds(left[0], right[0]));
}

function stronglyConnectedRegions(
  componentIds: readonly ComponentId[],
  outgoing: ReadonlyMap<ComponentId, readonly ArchitectureConnection[]>,
): ComponentId[][] {
  let nextIndex = 0;
  const indexById = new Map<ComponentId, number>();
  const lowLinkById = new Map<ComponentId, number>();
  const stack: ComponentId[] = [];
  const onStack = new Set<ComponentId>();
  const regions: ComponentId[][] = [];

  function visit(componentId: ComponentId): void {
    const index = nextIndex++;
    indexById.set(componentId, index);
    lowLinkById.set(componentId, index);
    stack.push(componentId);
    onStack.add(componentId);

    for (const connection of outgoing.get(componentId)!) {
      const targetId = connection.targetComponentId;
      if (!indexById.has(targetId)) {
        visit(targetId);
        lowLinkById.set(
          componentId,
          Math.min(lowLinkById.get(componentId)!, lowLinkById.get(targetId)!),
        );
      } else if (onStack.has(targetId)) {
        lowLinkById.set(
          componentId,
          Math.min(lowLinkById.get(componentId)!, indexById.get(targetId)!),
        );
      }
    }

    if (lowLinkById.get(componentId) !== index) return;
    const region: ComponentId[] = [];
    let memberId: ComponentId;
    do {
      memberId = stack.pop()!;
      onStack.delete(memberId);
      region.push(memberId);
    } while (memberId !== componentId);
    region.sort(compareIds);
    regions.push(region);
  }

  for (const componentId of componentIds) {
    if (!indexById.has(componentId)) visit(componentId);
  }
  return regions.sort((left, right) => compareIds(left[0], right[0]));
}

function findCycleWitness(
  members: readonly ComponentId[],
  outgoing: ReadonlyMap<ComponentId, readonly ArchitectureConnection[]>,
): DirectedCycleWitness {
  const memberIds = new Set(members);
  const completed = new Set<ComponentId>();
  const activeIndexById = new Map<ComponentId, number>();
  const pathComponentIds: ComponentId[] = [];
  const pathConnectionIds: ConnectionId[] = [];

  function visit(componentId: ComponentId): DirectedCycleWitness | undefined {
    activeIndexById.set(componentId, pathComponentIds.length);
    pathComponentIds.push(componentId);

    for (const connection of outgoing.get(componentId)!) {
      const targetId = connection.targetComponentId;
      if (!memberIds.has(targetId)) continue;
      const activeIndex = activeIndexById.get(targetId);
      if (activeIndex !== undefined) {
        return {
          componentIds: [...pathComponentIds.slice(activeIndex), targetId],
          connectionIds: [...pathConnectionIds.slice(activeIndex), connection.id],
        };
      }
      if (completed.has(targetId)) continue;
      pathConnectionIds.push(connection.id);
      const witness = visit(targetId);
      if (witness) return witness;
      pathConnectionIds.pop();
    }

    pathComponentIds.pop();
    activeIndexById.delete(componentId);
    completed.add(componentId);
    return undefined;
  }

  for (const memberId of members) {
    if (completed.has(memberId)) continue;
    const witness = visit(memberId);
    if (witness) return witness;
  }
  throw new Error("A cyclic strongly connected region had no directed cycle.");
}

/** Derived graph facts only; the input graph is never changed or retained. */
export function analyzeArchitecture(graph: ArchitectureGraph): ArchitectureAnalysis {
  const components = [...graph.getComponents()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const connections = [...graph.getConnections()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const componentIds = components.map((component) => component.id);
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const outgoing = new Map<ComponentId, ArchitectureConnection[]>();
  const incomingCount = new Map<ComponentId, number>();
  const neighbors = new Map<ComponentId, ComponentId[]>();
  const connectionsBySource = new Map<
    ComponentId,
    Map<ComponentId, ArchitectureConnection>
  >();
  for (const componentId of componentIds) {
    outgoing.set(componentId, []);
    incomingCount.set(componentId, 0);
    neighbors.set(componentId, []);
    connectionsBySource.set(componentId, new Map());
  }

  for (const connection of connections) {
    const sourceId = connection.sourceComponentId;
    const targetId = connection.targetComponentId;
    outgoing.get(sourceId)!.push(connection);
    incomingCount.set(targetId, incomingCount.get(targetId)! + 1);
    neighbors.get(sourceId)!.push(targetId);
    neighbors.get(targetId)!.push(sourceId);
    connectionsBySource.get(sourceId)!.set(targetId, connection);
  }
  for (const edges of outgoing.values()) {
    edges.sort((left, right) =>
      compareIds(left.targetComponentId, right.targetComponentId) ||
      compareIds(left.id, right.id),
    );
  }
  for (const adjacentIds of neighbors.values()) adjacentIds.sort(compareIds);

  const componentDegrees: ComponentDegree[] = componentIds.map((componentId) => ({
    componentId,
    incoming: incomingCount.get(componentId)!,
    outgoing: outgoing.get(componentId)!.length,
  }));
  const regions = weaklyConnectedRegions(componentIds, neighbors);
  const findings: ArchitectureFinding[] = [];

  const isolatedIds = componentDegrees
    .filter(({ incoming, outgoing: outgoingCount }) => incoming === 0 && outgoingCount === 0)
    .map(({ componentId }) => componentId);
  if (isolatedIds.length > 0) {
    findings.push({
      key: findingKey("isolated-components", isolatedIds),
      ruleId: "isolated-components",
      category: "structure",
      referencedComponentIds: isolatedIds,
      referencedConnectionIds: [],
      evidence: { incoming: 0, outgoing: 0 },
    });
  }

  if (regions.length > 1) {
    findings.push({
      key: findingKey("disconnected-structure", []),
      ruleId: "disconnected-structure",
      category: "structure",
      referencedComponentIds: componentIds,
      referencedConnectionIds: [],
      evidence: { regions },
    });
  }

  const cyclicRegions = stronglyConnectedRegions(componentIds, outgoing).filter(
    (region) => region.length > 1,
  );
  const cyclicRegionIndexById = new Map<ComponentId, number>();
  const internalConnectionIdsByRegion = cyclicRegions.map(() => [] as ConnectionId[]);
  cyclicRegions.forEach((members, regionIndex) => {
    for (const memberId of members) cyclicRegionIndexById.set(memberId, regionIndex);
  });
  for (const connection of connections) {
    const regionIndex = cyclicRegionIndexById.get(connection.sourceComponentId);
    if (
      regionIndex !== undefined &&
      regionIndex === cyclicRegionIndexById.get(connection.targetComponentId)
    ) {
      internalConnectionIdsByRegion[regionIndex].push(connection.id);
    }
  }
  for (const [regionIndex, members] of cyclicRegions.entries()) {
    const internalConnectionIds = internalConnectionIdsByRegion[regionIndex];
    findings.push({
      key: findingKey("directed-cyclic-region", members),
      ruleId: "directed-cyclic-region",
      category: "structure",
      referencedComponentIds: members,
      referencedConnectionIds: internalConnectionIds,
      evidence: {
        memberComponentIds: members,
        internalConnectionIds,
        witness: findCycleWitness(members, outgoing),
      },
    });
  }

  for (const connection of connections) {
    const source = componentsById.get(connection.sourceComponentId)!;
    const target = componentsById.get(connection.targetComponentId)!;
    if (source.kind !== "client" || target.kind !== "database") continue;
    findings.push({
      key: findingKey("client-database-connection", [connection.id]),
      ruleId: "client-database-connection",
      category: "relationship-review",
      referencedComponentIds: [source.id, target.id].sort(compareIds),
      referencedConnectionIds: [connection.id],
      evidence: {
        sourceComponentId: source.id,
        targetComponentId: target.id,
        connectionId: connection.id,
        sourceKind: "client",
        targetKind: "database",
        connectionKind: connection.kind,
      },
    });
  }

  let reciprocalPairCount = 0;
  for (const firstComponentId of componentIds) {
    for (const forward of outgoing.get(firstComponentId)!) {
      const secondComponentId = forward.targetComponentId;
      if (compareIds(firstComponentId, secondComponentId) >= 0) continue;
      const reverse = connectionsBySource.get(secondComponentId)!.get(firstComponentId);
      if (!reverse) continue;
      reciprocalPairCount += 1;
      if (forward.kind !== "request-response" || reverse.kind !== "request-response") {
        continue;
      }
      const pairConnectionIds = [forward.id, reverse.id].sort(compareIds);
      findings.push({
        key: findingKey("reciprocal-request-response", pairConnectionIds),
        ruleId: "reciprocal-request-response",
        category: "relationship-review",
        referencedComponentIds: [firstComponentId, secondComponentId],
        referencedConnectionIds: pairConnectionIds,
        evidence: {
          firstComponentId,
          secondComponentId,
          firstToSecondConnectionId: forward.id,
          secondToFirstConnectionId: reverse.id,
          firstToSecondKind: "request-response",
          secondToFirstKind: "request-response",
        },
      });
    }
  }

  return {
    summary: {
      componentCount: components.length,
      connectionCount: connections.length,
      weaklyConnectedRegionCount: regions.length,
      reciprocalPairCount,
    },
    componentDegrees,
    findings,
  };
}

export type ArchitectureFindingDescription = Readonly<{
  message: string;
  reviewQuestion?: string;
}>;

export function getArchitectureFindingComponentName(
  componentId: ComponentId,
  components: ReadonlyArray<Readonly<ArchitectureComponent>>,
): string {
  const component = components.find(({ id }) => id === componentId);
  if (!component) throw new Error("Finding refers to a component missing from the graph.");
  const nameIsAmbiguous = components.some(
    ({ id, name }) => id !== componentId && name === component.name,
  );
  return nameIsAmbiguous ? `${component.name} (${component.id})` : component.name;
}

/** Human wording stays separate from the evidence consumed by other layers. */
export function describeArchitectureFinding(
  finding: ArchitectureFinding,
  graph: ArchitectureGraph,
): ArchitectureFindingDescription {
  switch (finding.ruleId) {
    case "isolated-components": {
      const count = finding.referencedComponentIds.length;
      return {
        message: `${count} ${count === 1 ? "component has" : "components have"} no connections in this diagram.`,
      };
    }
    case "disconnected-structure": {
      const count = finding.evidence.regions.length;
      return {
        message: `The diagram contains ${count} disconnected regions.`,
      };
    }
    case "directed-cyclic-region":
      return {
        message: `These ${finding.evidence.memberComponentIds.length} components form a region containing directed cycles.`,
        reviewQuestion: "Review whether these connection directions are intentional.",
      };
    case "client-database-connection": {
      const components = graph.getComponents();
      const sourceName = getArchitectureFindingComponentName(finding.evidence.sourceComponentId, components);
      const targetName = getArchitectureFindingComponentName(finding.evidence.targetComponentId, components);
      return {
        message: `${sourceName} connects directly to ${targetName} in this diagram.`,
        reviewQuestion: "Is direct access intentional, and where is access control enforced?",
      };
    }
    case "reciprocal-request-response": {
      const components = graph.getComponents();
      const firstName = getArchitectureFindingComponentName(finding.evidence.firstComponentId, components);
      const secondName = getArchitectureFindingComponentName(finding.evidence.secondComponentId, components);
      return {
        message: `${firstName} and ${secondName} each have a request/response connection to the other.`,
        reviewQuestion: "Do these represent separately initiated interactions, or the request and response of one interaction?",
      };
    }
  }
}
