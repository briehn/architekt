import "server-only";

import {
  generationFailure,
  parseArchitectureGenerationRequest,
  type ArchitectureGenerationFailureType,
  type ArchitectureGenerationProvider,
} from "../application/architecture-generation";
import { generateArchitecture } from "../application/generate-architecture";

// Enough for 5,000 fully escaped UTF-16 units plus the JSON envelope.
export const ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES = 32 * 1024;

const statusByFailure = {
  "invalid-request": 400,
  "configuration-unavailable": 503,
  "generation-refused": 422,
  "generation-incomplete": 422,
  "generation-timeout": 504,
  "generation-rate-limited": 429,
  "provider-unavailable": 503,
  "invalid-generation": 502,
  "generation-failed": 502,
} satisfies Record<ArchitectureGenerationFailureType, number>;

function errorResponse(type: ArchitectureGenerationFailureType): Response {
  return Response.json({ error: generationFailure(type) }, {
    status: statusByFailure[type], headers: { "Cache-Control": "no-store" },
  });
}

async function readGenerationBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES)) {
    await request.body?.cancel();
    throw new Error("Invalid body size");
  }
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES) throw new Error("Body too large");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function handleArchitectureGenerationPost(
  request: Request,
  createProvider: () => ArchitectureGenerationProvider | undefined,
): Promise<Response> {
  let input: unknown;
  try {
    input = await readGenerationBody(request);
  } catch {
    return errorResponse("invalid-request");
  }
  const parsed = parseArchitectureGenerationRequest(input);
  if (!parsed) return errorResponse("invalid-request");
  try {
    const provider = createProvider();
    if (!provider) return errorResponse("configuration-unavailable");
    const result = await generateArchitecture(parsed, provider);
    if (!result.ok) return errorResponse(result.error.type);
    return Response.json(result.proposal, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("generation-failed");
  }
}
