import "server-only";

import OpenAI, { type ClientOptions } from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type {
  ArchitectureGenerationProvider,
  ArchitectureGenerationProviderResult,
} from "../application/architecture-generation";
import {
  ARCHITECTURE_GENERATION_MAX_OUTPUT_TOKENS,
  ARCHITECTURE_GENERATION_MAX_RETRIES,
  ARCHITECTURE_GENERATION_REASONING_EFFORT,
  ARCHITECTURE_GENERATION_TIMEOUT_MS,
  type ArchitectureGenerationConfig,
} from "./architecture-generation-config";
import { architectureGenerationInstructions, architectureProposalSchema } from "./architecture-proposal-schema";

// Only the SDK surface this adapter uses; a fake needs no SDK implementation.
export type ArchitectureResponsesClient = {
  responses: {
    create(request: ResponseCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<Pick<Response, "status" | "output" | "error" | "incomplete_details">>;
  };
};

function failed(type: Extract<ArchitectureGenerationProviderResult, { ok: false }>["type"]): ArchitectureGenerationProviderResult {
  return { ok: false, type };
}

function normalizeError(error: unknown): ArchitectureGenerationProviderResult {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return failed("generation-timeout");
  if (error instanceof OpenAI.APIConnectionError) return failed("provider-unavailable");
  if (error instanceof OpenAI.APIError) {
    if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(error.code ?? "")) {
      return failed("configuration-unavailable");
    }
    if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 400) {
      return failed("configuration-unavailable");
    }
    if (error.status === 429) return failed("generation-rate-limited");
    if (error.status === 408 || error.status === 504) return failed("generation-timeout");
    if (error.status !== undefined && error.status >= 500) return failed("provider-unavailable");
  }
  return failed("generation-failed");
}

export function createOpenAIArchitectureProvider(
  config: ArchitectureGenerationConfig,
  createClient: (options: ClientOptions) => ArchitectureResponsesClient = (options) => new OpenAI(options),
): ArchitectureGenerationProvider {
  // Called lazily after request validation. Never create a client at module load.
  const client = createClient({
    apiKey: config.apiKey,
    baseURL: "https://api.openai.com/v1",
    timeout: ARCHITECTURE_GENERATION_TIMEOUT_MS,
    maxRetries: ARCHITECTURE_GENERATION_MAX_RETRIES,
    // Override OPENAI_LOG so SDK debug logging cannot disclose prompts/responses.
    logLevel: "off",
  });
  return {
    async generate(request) {
      // The SDK fetch timeout ends at response headers. Keep a deadline alive
      // through body consumption as well, and abort the underlying request.
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), ARCHITECTURE_GENERATION_TIMEOUT_MS);
      try {
        const response = await client.responses.create({
          model: config.model,
          store: false,
          instructions: architectureGenerationInstructions,
          input: [{ role: "user", content: request.prompt }],
          reasoning: { effort: ARCHITECTURE_GENERATION_REASONING_EFFORT },
          max_output_tokens: ARCHITECTURE_GENERATION_MAX_OUTPUT_TOKENS,
          text: { format: { type: "json_schema", name: "architecture_proposal", strict: true, schema: architectureProposalSchema } },
        }, { signal: deadline.signal });
        const messages = response.output.filter((entry) => entry.type === "message");
        if (messages.some((message) => message.content.some((part) => part.type === "refusal"))) {
          return failed("generation-refused");
        }
        if (response.status === "incomplete") return failed("generation-incomplete");
        if (response.error) {
          switch (response.error.code) {
            case "rate_limit_exceeded": return failed("generation-rate-limited");
            case "server_error": return failed("provider-unavailable");
            case "invalid_prompt":
            case "bio_policy":
            case "misalignment_policy_violation": return failed("generation-refused");
            default: return failed("generation-failed");
          }
        }
        if (response.status === "failed") return failed("generation-failed");
        if (response.status !== "completed") return failed("generation-incomplete");
        if (messages.some((message) => message.status !== "completed")) return failed("generation-incomplete");
        const texts = messages.flatMap((message) => message.content.filter((part) => part.type === "output_text"));
        if (texts.length === 0 || !texts[0].text.trim()) return failed("generation-incomplete");
        if (texts.length !== 1) return failed("invalid-generation");
        try {
          const output: unknown = JSON.parse(texts[0].text);
          return { ok: true, output };
        } catch {
          return failed("invalid-generation");
        }
      } catch (error) {
        if (deadline.signal.aborted) return failed("generation-timeout");
        return normalizeError(error);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
