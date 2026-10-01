import "server-only";

export const ARCHITECTURE_GENERATION_TIMEOUT_MS = 40_000;
export const ARCHITECTURE_GENERATION_MAX_OUTPUT_TOKENS = 12_000;
export const ARCHITECTURE_GENERATION_MAX_RETRIES = 0;
export const ARCHITECTURE_GENERATION_REASONING_EFFORT = "medium";
export const ARCHITECTURE_GENERATION_DEFAULT_MODEL = "gpt-6-luna";

export type ArchitectureGenerationConfig = Readonly<{ apiKey: string; model: string }>;

export function loadArchitectureGenerationConfig(): ArchitectureGenerationConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  return {
    apiKey,
    model: process.env.ARCHITEKT_OPENAI_MODEL?.trim() || ARCHITECTURE_GENERATION_DEFAULT_MODEL,
  };
}
