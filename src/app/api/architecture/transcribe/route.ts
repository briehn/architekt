import { loadArchitectureTranscriptionConfig } from "../../../../server/architecture-transcription-config";
import { handleArchitectureTranscriptionPost } from "../../../../server/architecture-transcription-http";
import { createOpenAIArchitectureTranscriptionProvider } from "../../../../server/openai-architecture-transcription-provider";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleArchitectureTranscriptionPost(request, () => {
    const config = loadArchitectureTranscriptionConfig();
    return config ? createOpenAIArchitectureTranscriptionProvider(config) : undefined;
  });
}
