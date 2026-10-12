import "server-only";

import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { parseArchitectureProposal } from "./architecture-proposal";
import { translateArchitectureProposal } from "./translate-architecture-proposal";
import {
  generationFailure,
  parseArchitectureGenerationRequest,
  type ArchitectureGenerationProvider,
  type ArchitectureGenerationResult,
} from "./architecture-generation";

export async function generateArchitecture(
  input: unknown,
  provider: ArchitectureGenerationProvider,
  signal?: AbortSignal,
): Promise<ArchitectureGenerationResult> {
  const request = parseArchitectureGenerationRequest(input);
  if (!request) return { ok: false, error: generationFailure("invalid-request") };

  try {
    if (signal?.aborted) return { ok: false, error: generationFailure("generation-failed") };
    const result = signal ? await provider.generate(request, signal) : await provider.generate(request);
    if (signal?.aborted) return { ok: false, error: generationFailure("generation-failed") };
    if (!result.ok) return { ok: false, error: generationFailure(result.type) };
    const parsed = parseArchitectureProposal(result.output);
    if (!parsed.ok) return { ok: false, error: generationFailure("invalid-generation") };

    let componentIndex = 0;
    let connectionIndex = 0;
    // Admission only: domain operations stay authoritative; this graph and its IDs
    // are discarded. The separate Apply path allocates real application IDs.
    const translated = translateArchitectureProposal(parsed.proposal, {
      createComponentId: () => `admission-component-${componentIndex++}` as ComponentId,
      createConnectionId: () => `admission-connection-${connectionIndex++}` as ConnectionId,
    });
    if (!translated.ok) return { ok: false, error: generationFailure("invalid-generation") };
    return { ok: true, proposal: parsed.proposal };
  } catch {
    return { ok: false, error: generationFailure("generation-failed") };
  }
}
