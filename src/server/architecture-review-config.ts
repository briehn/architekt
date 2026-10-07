import "server-only";

export const ARCHITECTURE_REVIEW_DEFAULT_MODEL = "gpt-6-luna";
export const ARCHITECTURE_REVIEW_REASONING_EFFORT = "medium";
export const ARCHITECTURE_REVIEW_MAX_OUTPUT_TOKENS = 8_000;
export const ARCHITECTURE_REVIEW_PROVIDER_TIMEOUT_MS = 60_000;
export const ARCHITECTURE_REVIEW_BODY_TIMEOUT_MS = 15_000;
export const ARCHITECTURE_REVIEW_BODY_LIMIT_BYTES = 256 * 1024;
export const ARCHITECTURE_REVIEW_EXPANDED_INPUT_LIMIT_BYTES = 256 * 1024;
export const ARCHITECTURE_REVIEW_RAW_OUTPUT_LIMIT_BYTES = 64 * 1024;
export const ARCHITECTURE_REVIEW_RESPONSE_LIMIT_BYTES = 256 * 1024;

export type ArchitectureReviewConfig = Readonly<{ apiKey: string; model: string }>;

export function loadArchitectureReviewConfig(): ArchitectureReviewConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  return {
    apiKey,
    model: process.env.ARCHITEKT_OPENAI_REVIEW_MODEL?.trim() || ARCHITECTURE_REVIEW_DEFAULT_MODEL,
  };
}
