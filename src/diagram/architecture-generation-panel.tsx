import type { FormEvent, RefObject } from "react";

import { ARCHITECTURE_GENERATION_PROMPT_LIMIT } from "../application/architecture-generation";
import { getComponentKindPresentation } from "./component-kind-presentation";
import { getConnectionKindPresentation } from "./connection-kind-presentation";
import type { ArchitectureGenerationReviewState } from "./architecture-generation-review";

type ArchitectureGenerationPanelProps = Readonly<{
  open: boolean;
  review: ArchitectureGenerationReviewState;
  applyDisabled: boolean;
  toggleButtonRef: RefObject<HTMLButtonElement | null>;
  onToggle(): void;
  onPromptChange(prompt: string): void;
  onGenerate(): void;
  onCancel(): void;
  onApply(): void;
  onDiscard(): void;
}>;

const secondaryButton = "h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const primaryButton = "h-9 rounded-md bg-accent px-3 text-xs font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted";

export function ArchitectureGenerationPanel({
  open, review, applyDisabled, toggleButtonRef, onToggle, onPromptChange, onGenerate, onCancel, onApply, onDiscard,
}: ArchitectureGenerationPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onGenerate();
  }

  const componentByRef = review.status === "review"
    ? new Map(review.proposal.components.map((component) => [component.ref, component]))
    : null;

  return (
    <div className="border-t border-border pt-3">
      <button aria-expanded={open} className={secondaryButton} onClick={onToggle} ref={toggleButtonRef} type="button">
        Generate architecture
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {review.status === "review" ? "Architecture draft ready. Review it before applying." : ""}
      </p>
      {open ? (
        <div className="mt-3 max-h-[min(42vh,26rem)] overflow-y-auto rounded-lg border border-border bg-surface-subtle p-3">
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-semibold text-text-secondary" htmlFor="architecture-generation-prompt">
              Describe your system
            </label>
            <textarea
              className="mt-2 min-h-20 w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-70"
              disabled={review.status === "loading" || review.status === "review"}
              id="architecture-generation-prompt"
              maxLength={ARCHITECTURE_GENERATION_PROMPT_LIMIT}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="For example, a URL shortener with caching and analytics"
              value={review.prompt}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {review.status === "loading" ? (
                <span className="text-sm text-text-secondary" role="status">Generating proposal…</span>
              ) : null}
              {review.status !== "review" ? (
                <button
                  className={review.status === "loading" ? secondaryButton : primaryButton}
                  onClick={review.status === "loading" ? (event) => {
                    // Cancellation changes this same button back into a submit button.
                    event.preventDefault();
                    onCancel();
                  } : undefined}
                  type={review.status === "loading" ? "button" : "submit"}
                >
                  {review.status === "loading" ? "Cancel" : "Generate"}
                </button>
              ) : null}
            </div>
          </form>
          {review.status === "error" ? (
            <p className="mt-2 text-sm text-danger" role="alert">{review.error.message}</p>
          ) : null}
          {review.status === "review" ? (
            <div className="mt-3 border-t border-border pt-3">
              <h2 className="text-sm font-semibold text-text-primary">AI-generated draft</h2>
              <p className="mt-1 text-xs text-text-secondary">This is not a validated design. Apply replaces your current diagram. You can Undo to restore it.</p>
              <p className="mt-2 text-sm text-text-primary">{review.proposal.summary}</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div>
                  <h3 className="text-xs font-semibold text-text-secondary">Assumptions</h3>
                  {review.proposal.assumptions.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-primary">
                      {review.proposal.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}
                    </ul>
                  ) : <p className="mt-1 text-sm text-text-muted">None stated.</p>}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-secondary">Components</h3>
                  <ul className="mt-1 space-y-1 text-sm text-text-primary">
                    {review.proposal.components.map((component) => (
                      <li key={component.ref}>{component.name} <span className="text-text-secondary">· {getComponentKindPresentation(component.kind).label}</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-secondary">Connections</h3>
                  {review.proposal.connections.length ? (
                    <ul className="mt-1 space-y-1 text-sm text-text-primary">
                      {review.proposal.connections.map((connection, index) => (
                        <li key={index}>
                          {componentByRef?.get(connection.sourceRef)?.name} → {componentByRef?.get(connection.targetRef)?.name}{" "}
                          <span className="text-text-secondary">· {getConnectionKindPresentation(connection.kind).accessibleLabel}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-text-muted">None proposed.</p>}
                </div>
              </div>
              {review.applyError ? (
                <p className="mt-3 text-sm text-danger" role="alert">Could not apply this proposal. Your diagram is unchanged. You can try again or discard it.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={primaryButton} disabled={applyDisabled} onClick={onApply} type="button">Apply to diagram</button>
                <button className={secondaryButton} onClick={onDiscard} type="button">Discard</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
