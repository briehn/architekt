import "server-only";

import OpenAI, { type ClientOptions } from "openai";
import type { ResponseCreateParamsNonStreaming, Response } from "openai/resources/responses/responses";
import type { ArchitectureReviewProvider, ArchitectureReviewProviderResult } from "../application/architecture-review/architecture-review";
import { ARCHITECTURE_REVIEW_MAX_OUTPUT_TOKENS, ARCHITECTURE_REVIEW_PROVIDER_TIMEOUT_MS,
  ARCHITECTURE_REVIEW_RAW_OUTPUT_LIMIT_BYTES, ARCHITECTURE_REVIEW_REASONING_EFFORT,
  type ArchitectureReviewConfig } from "./architecture-review-config";
import { architectureReviewInstructions, architectureReviewSchema } from "./architecture-review-schema";

export type ArchitectureReviewResponsesClient = {
  responses: {
    create(request: ResponseCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<Pick<Response, "status" | "output" | "error" | "incomplete_details">>;
  };
};

type Failure = Extract<ArchitectureReviewProviderResult, { ok: false }>["type"];
const failed = (type: Failure): ArchitectureReviewProviderResult => ({ ok: false, type });

function expectedSdkFailure(error: unknown): ArchitectureReviewProviderResult | undefined {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return failed("review-timeout");
  if (error instanceof OpenAI.APIConnectionError) return failed("provider-unavailable");
  if (error instanceof OpenAI.APIError) {
    if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(error.code ?? "")) return failed("configuration-unavailable");
    if ([400, 401, 403, 404].includes(error.status ?? -1)) return failed("configuration-unavailable");
    if (error.status === 429) return failed("review-rate-limited");
    if (error.status === 408 || error.status === 504) return failed("review-timeout");
    if (error.status !== undefined && error.status >= 500) return failed("provider-unavailable");
  }
}

export function createOpenAIArchitectureReviewProvider(
  config: ArchitectureReviewConfig,
  createClient: (options: ClientOptions) => ArchitectureReviewResponsesClient = (options) => new OpenAI(options),
): ArchitectureReviewProvider {
  const client = createClient({
    apiKey: config.apiKey,
    baseURL: "https://api.openai.com/v1",
    timeout: ARCHITECTURE_REVIEW_PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
    logLevel: "off",
  });
  return {
    async review(catalog, signal) {
      if (signal.aborted) return failed("review-canceled");
      const deadline = new AbortController();
      let timedOut = false;
      const onAbort = () => deadline.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; deadline.abort(); }, ARCHITECTURE_REVIEW_PROVIDER_TIMEOUT_MS);
      const interrupted = new Promise<never>((_resolve, reject) => {
        deadline.signal.addEventListener("abort", () => reject(new Error("Review interrupted")), { once: true });
      });
      try {
        if (signal.aborted) return failed("review-canceled");
        const response = await Promise.race([
          client.responses.create({
            model: config.model,
            store: false,
            instructions: architectureReviewInstructions,
            input: [{ role: "user", content: `ARCHITEKT_REVIEW_DATA_JSON\n${JSON.stringify(catalog)}` }],
            reasoning: { effort: ARCHITECTURE_REVIEW_REASONING_EFFORT },
            max_output_tokens: ARCHITECTURE_REVIEW_MAX_OUTPUT_TOKENS,
            text: { format: { type: "json_schema", name: "architecture_review_selection", strict: true, schema: architectureReviewSchema(catalog) } },
          }, { signal: deadline.signal }),
          interrupted,
        ]);
        if (signal.aborted) return failed("review-canceled");
        if (timedOut) return failed("review-timeout");
        const messages = response.output.filter((entry) => entry.type === "message");
        if (messages.some((message) => message.content.some((part) => part.type === "refusal"))) return failed("provider-refused");
        if (response.status === "incomplete") return failed("provider-incomplete");
        if (response.error) {
          switch (response.error.code) {
            case "rate_limit_exceeded": return failed("review-rate-limited");
            case "server_error": return failed("provider-unavailable");
            case "invalid_prompt":
            case "bio_policy":
            case "misalignment_policy_violation": return failed("provider-refused");
            default: return failed("review-failed");
          }
        }
        if (response.status === "failed") return failed("review-failed");
        if (response.status !== "completed" || messages.some((message) => message.status !== "completed")) return failed("provider-incomplete");
        const texts = messages.flatMap((message) => message.content.filter((part) => part.type === "output_text"));
        if (texts.length === 0 || !texts[0].text.trim()) return failed("provider-incomplete");
        if (texts.length !== 1 || Buffer.byteLength(texts[0].text, "utf8") > ARCHITECTURE_REVIEW_RAW_OUTPUT_LIMIT_BYTES) return failed("invalid-provider-result");
        try { return { ok: true, output: JSON.parse(texts[0].text) as unknown }; }
        catch { return failed("invalid-provider-result"); }
      } catch (error) {
        if (signal.aborted) return failed("review-canceled");
        if (timedOut) return failed("review-timeout");
        const mapped = expectedSdkFailure(error);
        if (mapped) return mapped;
        throw error;
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
