import { getComponentKindLabel, getConnectionKindLabel } from "../architecture-kind-labels";
import type { DesignContextField } from "../design-context";
import type { ArchitectureFinding } from "../architecture-analysis/architecture-analysis";
import { REVIEW_CONTEXT_FIELDS } from "./architecture-review";
import type { ArchitectureReviewSnapshot, ReviewCatalogEntry, ReviewEvidence, ReviewEvidenceCatalog } from "./architecture-review";

export type ReviewEvidenceIndex = Readonly<{
  catalog: ReviewEvidenceCatalog;
  resolve(alias: string): ReviewEvidence | undefined;
}>;

function displayName(id: string, name: string, peers: readonly { id: string; name: string }[]): string {
  return peers.some((peer) => peer.id !== id && peer.name === name) ? `${name} (${id})` : name;
}

export function formatModeledReviewFact(evidence: Exclude<ReviewEvidence, { type: "design-context" }>, snapshot: ArchitectureReviewSnapshot): string | undefined {
  switch (evidence.type) {
    case "component": {
      const component = snapshot.components.find((entry) => entry.id === evidence.id);
      return component ? `${displayName(component.id, component.name, snapshot.components)} is modeled as a ${getComponentKindLabel(component.kind)}.` : undefined;
    }
    case "connection": {
      const connection = snapshot.connections.find((entry) => entry.id === evidence.id);
      if (!connection) return undefined;
      const source = snapshot.components.find((entry) => entry.id === connection.sourceComponentId);
      const target = snapshot.components.find((entry) => entry.id === connection.targetComponentId);
      if (!source || !target) return undefined;
      return `${displayName(source.id, source.name, snapshot.components)} has a directed ${getConnectionKindLabel(connection.kind).toLowerCase()} connection to ${displayName(target.id, target.name, snapshot.components)}.`;
    }
    case "boundary": {
      const boundary = snapshot.boundaries.find((entry) => entry.id === evidence.id);
      if (!boundary) return undefined;
      const count = boundary.memberComponentIds.length;
      return `${displayName(boundary.id, boundary.name, snapshot.boundaries)} contains ${count} modeled ${count === 1 ? "component" : "components"}.`;
    }
    case "analysis-finding":
      return snapshot.findingDescriptions.find((entry) => entry.key === evidence.key)?.description.message;
  }
}

/** Public catalog contains aliases and names, never canonical IDs. Resolution stays local. */
export function buildReviewEvidenceCatalog(snapshot: ArchitectureReviewSnapshot): ReviewEvidenceIndex {
  const entries: ReviewCatalogEntry[] = [];
  const evidenceByAlias = new Map<string, ReviewEvidence>();
  const componentAliases = new Map(snapshot.components.map((component, index) => [component.id, `C${index + 1}`]));
  const connectionAliases = new Map(snapshot.connections.map((connection, index) => [connection.id, `E${index + 1}`]));
  const aliasName = (id: string) => {
    const component = snapshot.components.find((entry) => entry.id === id)!;
    return snapshot.components.some((peer) => peer.id !== id && peer.name === component.name)
      ? `${component.name} (${componentAliases.get(component.id)})` : component.name;
  };
  function add(alias: string, evidence: ReviewEvidence, description: string, details?: Readonly<Record<string, unknown>>): void {
    const entry = Object.freeze({ alias, category: evidence.type, description, ...(details ? { details: Object.freeze(details) } : {}) });
    entries.push(entry);
    evidenceByAlias.set(alias, Object.freeze(evidence));
  }
  snapshot.components.forEach((component, index) => {
    const evidence = { type: "component", id: component.id } as const;
    const degree = snapshot.analysis.componentDegrees.find((entry) => entry.componentId === component.id)!;
    add(`C${index + 1}`, evidence, `${aliasName(component.id)} is modeled as a ${getComponentKindLabel(component.kind)}.`, { name: component.name, kind: component.kind, incomingRelationships: degree.incoming, outgoingRelationships: degree.outgoing });
  });
  snapshot.connections.forEach((connection, index) => {
    const evidence = { type: "connection", id: connection.id } as const;
    add(`E${index + 1}`, evidence, `${aliasName(connection.sourceComponentId)} has a directed ${getConnectionKindLabel(connection.kind).toLowerCase()} connection to ${aliasName(connection.targetComponentId)}.`, {
      source: componentAliases.get(connection.sourceComponentId),
      target: componentAliases.get(connection.targetComponentId),
      direction: "source-to-target",
      kind: connection.kind,
    });
  });
  snapshot.boundaries.forEach((boundary, index) => {
    const evidence = { type: "boundary", id: boundary.id } as const;
    add(`B${index + 1}`, evidence, `${boundary.name} contains ${boundary.memberComponentIds.length} modeled ${boundary.memberComponentIds.length === 1 ? "component" : "components"}.`, {
      name: boundary.name,
      memberComponents: Object.freeze(boundary.memberComponentIds.map((id) => componentAliases.get(id))),
    });
  });
  snapshot.analysis.findings.forEach((finding, index) => {
    const evidence = { type: "analysis-finding", key: finding.key } as const;
    const details: Record<string, unknown> = {
      ruleId: finding.ruleId,
      category: finding.category,
      referencedComponents: Object.freeze(finding.referencedComponentIds.map((id) => componentAliases.get(id))),
      referencedConnections: Object.freeze(finding.referencedConnectionIds.map((id) => connectionAliases.get(id))),
      evidence: Object.freeze(formatFindingEvidence(finding, componentAliases, connectionAliases)),
    };
    let description = formatModeledReviewFact(evidence, snapshot)!;
    for (const component of snapshot.components) {
      if (snapshot.components.some((peer) => peer.id !== component.id && peer.name === component.name)) {
        description = description.replaceAll(`(${component.id})`, `(${componentAliases.get(component.id)})`);
      }
    }
    add(`F${index + 1}`, evidence, description, details);
  });
  REVIEW_CONTEXT_FIELDS.forEach((field: DesignContextField, index) => {
    add(`D${index + 1}`, { type: "design-context", field }, `Committed Design Brief field: ${field}.`, { field, text: snapshot.designContext[field] });
  });
  return Object.freeze({
    catalog: Object.freeze({ reviewContractVersion: snapshot.reviewContractVersion, analysisContractVersion: snapshot.analysisContractVersion, summary: snapshot.analysis.summary, entries: Object.freeze(entries) }),
    resolve: (alias: string) => evidenceByAlias.get(alias),
  });
}

function formatFindingEvidence(
  finding: ArchitectureFinding,
  components: ReadonlyMap<string, string>,
  connections: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const c = (id: string) => components.get(id);
  const e = (id: string) => connections.get(id);
  switch (finding.ruleId) {
    case "isolated-components": return { incoming: 0, outgoing: 0 };
    case "disconnected-structure": return { regions: finding.evidence.regions.map((region) => region.map(c)) };
    case "directed-cyclic-region": return {
      members: finding.evidence.memberComponentIds.map(c),
      internalConnections: finding.evidence.internalConnectionIds.map(e),
      witness: { components: finding.evidence.witness.componentIds.map(c), connections: finding.evidence.witness.connectionIds.map(e) },
    };
    case "client-database-connection": return {
      source: c(finding.evidence.sourceComponentId), target: c(finding.evidence.targetComponentId),
      connection: e(finding.evidence.connectionId), sourceKind: finding.evidence.sourceKind,
      targetKind: finding.evidence.targetKind, connectionKind: finding.evidence.connectionKind,
    };
    case "reciprocal-request-response": return {
      firstComponent: c(finding.evidence.firstComponentId), secondComponent: c(finding.evidence.secondComponentId),
      firstToSecondConnection: e(finding.evidence.firstToSecondConnectionId),
      secondToFirstConnection: e(finding.evidence.secondToFirstConnectionId),
      firstToSecondKind: finding.evidence.firstToSecondKind, secondToFirstKind: finding.evidence.secondToFirstKind,
    };
  }
}
