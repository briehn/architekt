import { handlePaidAiLogout } from "../../../../server/paid-ai/http";
import { loadPaidAiRuntime } from "../../../../server/paid-ai/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Response {
  return handlePaidAiLogout(request, loadPaidAiRuntime());
}
