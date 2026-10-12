import { handlePaidAiStatus } from "../../../../server/paid-ai/http";
import { loadPaidAiRuntime } from "../../../../server/paid-ai/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handlePaidAiStatus(request, loadPaidAiRuntime());
}
