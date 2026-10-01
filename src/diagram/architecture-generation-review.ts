import {
  generationFailure,
  isArchitectureGenerationFailureType,
  parseArchitectureGenerationRequest,
  type ArchitectureGenerationFailure,
} from "../application/architecture-generation";
import {
  parseArchitectureProposal,
  type ArchitectureProposal,
} from "../application/architecture-proposal";

export type ArchitectureGenerationReviewState =
  | { status: "idle"; prompt: string }
  | { status: "loading"; prompt: string }
  | { status: "error"; prompt: string; error: ArchitectureGenerationFailure }
  | { status: "review"; prompt: string; proposal: ArchitectureProposal; applyError: boolean };

export type ArchitectureGenerationRequest = (
  prompt: string,
  signal: AbortSignal,
) => Promise<ArchitectureProposal | ArchitectureGenerationFailure>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestArchitectureGeneration(
  prompt: string,
  signal: AbortSignal,
): Promise<ArchitectureProposal | ArchitectureGenerationFailure> {
  const response = await fetch("/api/architecture/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    cache: "no-store",
    signal,
  });
  const body: unknown = await response.json();
  if (response.ok) {
    const parsed = parseArchitectureProposal(body);
    return parsed.ok ? parsed.proposal : generationFailure("invalid-generation");
  }
  const error = isRecord(body) ? body.error : undefined;
  if (isRecord(error) && isArchitectureGenerationFailureType(error.type) &&
      typeof error.retryable === "boolean" && typeof error.message === "string") {
    // Display application-owned copy; a broken or intermediary response is never trusted as UI text.
    return generationFailure(error.type);
  }
  return generationFailure("generation-failed");
}

function isFailure(value: ArchitectureProposal | ArchitectureGenerationFailure): value is ArchitectureGenerationFailure {
  return "type" in value;
}

export class ArchitectureGenerationReviewController {
  private state: ArchitectureGenerationReviewState = { status: "idle", prompt: "" };
  private activeRequest: AbortController | null = null;
  private requestVersion = 0;
  private disposed = false;

  constructor(
    private readonly onChange: (state: ArchitectureGenerationReviewState) => void,
    private readonly request: ArchitectureGenerationRequest = requestArchitectureGeneration,
  ) {}

  getState(): ArchitectureGenerationReviewState { return this.state; }

  private publish(state: ArchitectureGenerationReviewState) {
    if (this.disposed) return;
    this.state = state;
    this.onChange(state);
  }

  setPrompt(prompt: string) {
    if (this.state.status === "loading" || this.state.status === "review") return;
    this.publish({ status: "idle", prompt });
  }

  async generate() {
    if (this.disposed || this.state.status === "loading" || this.state.status === "review") return;
    const parsed = parseArchitectureGenerationRequest({ prompt: this.state.prompt });
    if (!parsed) {
      this.publish({ status: "error", prompt: this.state.prompt, error: generationFailure("invalid-request") });
      return;
    }
    const controller = new AbortController();
    const version = ++this.requestVersion;
    this.activeRequest = controller;
    this.publish({ status: "loading", prompt: this.state.prompt });
    try {
      const result = await this.request(parsed.prompt, controller.signal);
      if (this.disposed || controller.signal.aborted || version !== this.requestVersion) return;
      this.activeRequest = null;
      if (isFailure(result)) {
        this.publish({ status: "error", prompt: this.state.prompt, error: result });
      } else {
        const parsedProposal = parseArchitectureProposal(result);
        this.publish(parsedProposal.ok
          ? { status: "review", prompt: this.state.prompt, proposal: parsedProposal.proposal, applyError: false }
          : { status: "error", prompt: this.state.prompt, error: generationFailure("invalid-generation") });
      }
    } catch {
      if (this.disposed || controller.signal.aborted || version !== this.requestVersion) return;
      this.activeRequest = null;
      this.publish({ status: "error", prompt: this.state.prompt, error: generationFailure("generation-failed") });
    }
  }

  cancel() {
    if (this.state.status !== "loading") return;
    ++this.requestVersion;
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.publish({ status: "idle", prompt: this.state.prompt });
  }

  discard() {
    if (this.state.status !== "review") return;
    this.publish({ status: "idle", prompt: this.state.prompt });
  }

  applyFailed() {
    if (this.state.status !== "review") return;
    this.publish({ ...this.state, applyError: true });
  }

  applied() {
    if (this.state.status !== "review") return;
    this.publish({ status: "idle", prompt: "" });
  }

  dispose() {
    this.disposed = true;
    ++this.requestVersion;
    this.activeRequest?.abort();
    this.activeRequest = null;
  }
}
