import { loadArchitectureGenerationConfig } from "../../../../server/architecture-generation-config";
import { handleArchitectureGenerationPost } from "../../../../server/architecture-generation-http";
import { createOpenAIArchitectureProvider } from "../../../../server/openai-architecture-provider";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request): Promise<Response> {
  return handleArchitectureGenerationPost(request, () => {
    const config = loadArchitectureGenerationConfig();
    return config ? createOpenAIArchitectureProvider(config) : undefined;
  });
}
