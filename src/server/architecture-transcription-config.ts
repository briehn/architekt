import "server-only";

export const ARCHITECTURE_TRANSCRIPTION_DEFAULT_MODEL = "gpt-transcribe";
export const ARCHITECTURE_TRANSCRIPTION_PROVIDER_TIMEOUT_MS = 40_000;
export const ARCHITECTURE_TRANSCRIPTION_BODY_TIMEOUT_MS = 15_000;

export type ArchitectureTranscriptionConfig = Readonly<{ apiKey: string; model: string }>;

export function loadArchitectureTranscriptionConfig(): ArchitectureTranscriptionConfig | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return;
  return {
    apiKey,
    model: process.env.ARCHITEKT_OPENAI_TRANSCRIPTION_MODEL?.trim() || ARCHITECTURE_TRANSCRIPTION_DEFAULT_MODEL,
  };
}
