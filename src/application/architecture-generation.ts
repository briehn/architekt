import type { ArchitectureProposal } from "./architecture-proposal";

// UTF-16 code units, measured before trimming.
export const ARCHITECTURE_GENERATION_PROMPT_LIMIT = 5000;

export type ArchitectureGenerationRequest = Readonly<{ prompt: string }>;

export function parseArchitectureGenerationRequest(
  input: unknown,
): ArchitectureGenerationRequest | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return;
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 1 || keys[0] !== "prompt") return;
  const descriptor = Object.getOwnPropertyDescriptor(input, "prompt");
  const prompt: unknown = descriptor?.value;
  if (typeof prompt !== "string" || prompt.length > ARCHITECTURE_GENERATION_PROMPT_LIMIT) return;
  if (!prompt.trim()) return;
  return { prompt: prompt.trim() };
}

const failures = {
  "invalid-request": { retryable: false, message: `Enter a nonblank prompt of at most ${ARCHITECTURE_GENERATION_PROMPT_LIMIT.toLocaleString("en-US")} characters in the required request format.` },
  "configuration-unavailable": { retryable: false, message: "Architecture generation is not configured. Contact the application owner." },
  "generation-refused": { retryable: false, message: "This request could not be fulfilled. Try describing a different system." },
  "generation-incomplete": { retryable: true, message: "Generation did not produce a complete proposal. Try a simpler description." },
  "generation-timeout": { retryable: true, message: "Generation took too long. Please try again." },
  "generation-rate-limited": { retryable: true, message: "Generation is busy. Please try again later." },
  "provider-unavailable": { retryable: true, message: "Generation is temporarily unavailable. Please try again later." },
  "invalid-generation": { retryable: false, message: "The generated proposal could not be validated. Try revising the description." },
  "generation-failed": { retryable: false, message: "Architecture generation failed. Please try again later." },
} as const;

export type ArchitectureGenerationFailureType = keyof typeof failures;
export function isArchitectureGenerationFailureType(value: unknown): value is ArchitectureGenerationFailureType {
  return typeof value === "string" && Object.hasOwn(failures, value);
}
export type ArchitectureGenerationFailure = Readonly<{
  type: ArchitectureGenerationFailureType;
  retryable: boolean;
  message: string;
}>;

export function generationFailure(type: ArchitectureGenerationFailureType): ArchitectureGenerationFailure {
  return { type, ...failures[type] };
}

export type ArchitectureGenerationResult =
  | { ok: true; proposal: ArchitectureProposal }
  | { ok: false; error: ArchitectureGenerationFailure };

export type ArchitectureGenerationProviderRequest = ArchitectureGenerationRequest;
export type ArchitectureGenerationProviderResult =
  | { ok: true; output: unknown }
  | { ok: false; type: Exclude<ArchitectureGenerationFailureType, "invalid-request"> };

export interface ArchitectureGenerationProvider {
  generate(request: ArchitectureGenerationProviderRequest): Promise<ArchitectureGenerationProviderResult>;
}
