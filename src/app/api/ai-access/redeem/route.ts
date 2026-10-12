import { handlePaidAiRedeem } from "../../../../server/paid-ai/http";
import { loadPaidAiRuntime } from "../../../../server/paid-ai/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handlePaidAiRedeem(request, loadPaidAiRuntime());
}
