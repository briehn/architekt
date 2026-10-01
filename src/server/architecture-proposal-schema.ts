import "server-only";

import { ARCHITECTURE_PROPOSAL_LIMITS as limits } from "../application/architecture-proposal";
import { ARCHITECTURE_COMPONENT_KINDS } from "../domain/architecture-component";
import { ARCHITECTURE_CONNECTION_KINDS } from "../domain/architecture-connection";

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });

// JSON Schema counts Unicode code points; the parser's stricter UTF-16 limits
// and semantic checks remain authoritative after Structured Outputs.
export const architectureProposalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["components", "connections", "summary", "assumptions"],
  properties: {
    components: {
      type: "array", minItems: 1, maxItems: limits.components,
      items: {
        type: "object", additionalProperties: false,
        required: ["ref", "name", "kind"],
        properties: {
          ref: text(limits.ref), name: text(limits.componentName),
          kind: { type: "string", enum: [...ARCHITECTURE_COMPONENT_KINDS] },
        },
      },
    },
    connections: {
      type: "array", minItems: 0, maxItems: limits.connections,
      items: {
        type: "object", additionalProperties: false,
        required: ["sourceRef", "targetRef", "kind"],
        properties: {
          sourceRef: text(limits.ref), targetRef: text(limits.ref),
          kind: { type: "string", enum: [...ARCHITECTURE_CONNECTION_KINDS] },
        },
      },
    },
    summary: text(limits.summary),
    assumptions: { type: "array", minItems: 0, maxItems: limits.assumptions, items: text(limits.assumption) },
  },
};

export const architectureGenerationInstructions = `Produce a useful starting software system architecture for Architekt.
Use only these component kinds: ${ARCHITECTURE_COMPONENT_KINDS.join(", ")}.
Use only these connection kinds: ${ARCHITECTURE_CONNECTION_KINDS.join(", ")}.
Connection kinds describe architectural intent, not transport. Use data-access for reading or writing a database, cache, or file/object storage, including direct uploads and downloads. Use request-response for an interaction with a service that expects a reply; one such edge includes the reply and does not need a reverse edge. Use async-messaging for decoupled message delivery. Use streaming for an ongoing flow of events or values, such as live messages pushed from a gateway to clients; file transfer alone is data-access. Use generic only when intent is unknown.
Every edge is directed. For an independently initiated flow in each direction, include both ordered edges with their own kinds. In particular, show server-to-client push in that direction. Check that each flow described in the summary has a path in the graph.
Keep diagrams readable, use meaningful concise names and short unique proposal-local refs, and include only components that materially contribute.
Connect existing refs; avoid self-connections and duplicate ordered pairs. State important assumptions and summarize the design concisely.
Topology does not prove throughput, availability, or capacity; do not claim otherwise.
Keep quantitative assumptions internally consistent. Daily totals divided by 86,400 give average per-second rates; apply any stated peak multiplier only once. Omit derived rates when uncertain.
Represent unsupported concepts with supported abstractions and explain the assumption. For vague requests, choose a small reasonable system and state assumptions.
Do not add caches, queues, or workers merely because the user asks for speed or reliability; include them only for a concrete stated workflow or workload assumption.
Never emit coordinates, canonical IDs, ports, React Flow state, code, or URLs. Return only the requested proposal data.`;
