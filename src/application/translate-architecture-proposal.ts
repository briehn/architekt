import {
  ArchitectureGraph,
  type AddComponentRejection,
  type AddConnectionRejection,
} from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import {
  parseArchitectureProposal,
  type ArchitectureProposalParseError,
  type ArchitectureProposalReview,
} from "./architecture-proposal";

// Required injection keeps UUID generation at the application entry point, matching
// existing editor conventions without introducing browser or Node globals here.
export type ArchitectureProposalIdFactory = Readonly<{
  createComponentId: () => ComponentId;
  createConnectionId: () => ConnectionId;
}>;

export type ArchitectureProposalTranslationError =
  | ArchitectureProposalParseError
  | {
      type: "domain-rejection";
      entity: "component";
      index: number;
      rejection: AddComponentRejection;
    }
  | {
      type: "domain-rejection";
      entity: "connection";
      index: number;
      rejection: AddConnectionRejection;
    };

export type ArchitectureProposalTranslationResult =
  | { ok: true; graph: ArchitectureGraph; review: ArchitectureProposalReview }
  | { ok: false; error: ArchitectureProposalTranslationError };

/**
 * Revalidates even typed callers through the one public parser. Invalid input never
 * allocates IDs or reaches the domain. A candidate graph remains local until every
 * operation succeeds; ID allocation itself is not rolled back on domain rejection.
 */
export function translateArchitectureProposal(
  input: unknown,
  idFactory: ArchitectureProposalIdFactory,
): ArchitectureProposalTranslationResult {
  const parsed = parseArchitectureProposal(input);
  if (!parsed.ok) return parsed;

  const { proposal } = parsed;
  let graph = ArchitectureGraph.empty();
  const componentIdsByRef = new Map<string, ComponentId>();

  for (const [index, component] of proposal.components.entries()) {
    const id = idFactory.createComponentId();
    const result = graph.addComponent({
      id,
      name: component.name,
      kind: component.kind,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: {
          type: "domain-rejection",
          entity: "component",
          index,
          rejection: result.error,
        },
      };
    }
    graph = result.graph;
    componentIdsByRef.set(component.ref, id);
  }

  for (const [index, connection] of proposal.connections.entries()) {
    const sourceComponentId = componentIdsByRef.get(connection.sourceRef);
    const targetComponentId = componentIdsByRef.get(connection.targetRef);
    if (sourceComponentId === undefined || targetComponentId === undefined) {
      throw new Error("Validated proposal endpoint was not translated.");
    }
    const result = graph.addConnection({
      id: idFactory.createConnectionId(),
      sourceComponentId,
      targetComponentId,
      kind: connection.kind,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: {
          type: "domain-rejection",
          entity: "connection",
          index,
          rejection: result.error,
        },
      };
    }
    graph = result.graph;
  }

  return {
    ok: true,
    graph,
    review: { summary: proposal.summary, assumptions: proposal.assumptions },
  };
}
