import { loadArchitectureReviewConfig } from "../../../../server/architecture-review-config";
import { handleArchitectureReviewPost } from "../../../../server/architecture-review-http";
import { createOpenAIArchitectureReviewProvider } from "../../../../server/openai-architecture-review-provider";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleArchitectureReviewPost(request, () => {
    const config = loadArchitectureReviewConfig();
    return config ? createOpenAIArchitectureReviewProvider(config) : undefined;
  });
}
