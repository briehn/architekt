import { useEffect, useRef, type FormEvent } from "react";

import { ARCHITECTURE_GENERATION_PROMPT_LIMIT } from "../application/architecture-generation";
import { getComponentKindPresentation } from "./component-kind-presentation";
import { getConnectionKindPresentation } from "./connection-kind-presentation";
import type { ArchitectureGenerationReviewState } from "./architecture-generation-review";
import type { ArchitectureVoiceState } from "./architecture-voice-controller";

type ArchitectureGenerationPanelProps = Readonly<{
  review: ArchitectureGenerationReviewState;
  voice: ArchitectureVoiceState;
  voiceSupported: boolean;
  voiceExitMessage: string | null;
  applyDisabled: boolean;
  onPromptChange(prompt: string): void;
  onGenerate(): void;
  onCancel(): void;
  onApply(): void;
  onDiscard(): void;
  onSpeak(): void;
  onVoiceStop(): void;
  onVoiceCancel(): void;
  onVoiceRetry(): void;
  onVoiceDiscard(): void;
}>;

const secondaryButton = "h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const primaryButton = "h-9 rounded-md bg-accent px-3 text-xs font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted";

export function ArchitectureGenerationPanel({
  review, voice, voiceSupported, voiceExitMessage, applyDisabled, onPromptChange, onGenerate, onCancel, onApply, onDiscard,
  onSpeak, onVoiceStop, onVoiceCancel, onVoiceRetry, onVoiceDiscard,
}: ArchitectureGenerationPanelProps) {
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const previousVoiceStatus = useRef(voice.status);
  useEffect(() => {
    if (voice.status === "transcript-ready" && previousVoiceStatus.current === "transcribing") transcriptRef.current?.focus();
    previousVoiceStatus.current = voice.status;
  }, [voice.status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (review.prompt.length <= ARCHITECTURE_GENERATION_PROMPT_LIMIT && voice.status !== "recording" && voice.status !== "requesting-permission" && voice.status !== "transcribing") onGenerate();
  }

  const voiceBusy = voice.status === "requesting-permission" || voice.status === "recording" || voice.status === "transcribing";
  const promptTooLong = review.prompt.length > ARCHITECTURE_GENERATION_PROMPT_LIMIT;
  const transcriptMode = voice.status === "transcript-ready" || ("resume" in voice && voice.resume === "transcript-ready");
  const minutes = voice.status === "recording" ? Math.floor(voice.elapsedSeconds / 60) : 0;
  const seconds = voice.status === "recording" ? String(voice.elapsedSeconds % 60).padStart(2, "0") : "00";

  const componentByRef = review.status === "review"
    ? new Map(review.proposal.components.map((component) => [component.ref, component]))
    : null;

  return (
    <div className="min-w-0">
      <p className="sr-only" role="status" aria-live="polite">
        {review.status === "review" ? "Architecture draft ready. Review it before applying." : ""}
      </p>
        <div className="min-w-0">
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-semibold text-text-secondary" htmlFor="architecture-generation-prompt">
              {transcriptMode ? "Review transcript" : "Describe your system"}
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-sm border border-border bg-surface p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-70"
              aria-describedby="architecture-generation-prompt-count"
              aria-invalid={promptTooLong}
              disabled={review.status === "loading" || review.status === "review" || voiceBusy}
              id="architecture-generation-prompt"
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="For example, a URL shortener with caching and analytics"
              ref={transcriptRef}
              value={review.prompt}
            />
            <p className={`mt-1 text-xs ${promptTooLong ? "text-danger" : "text-text-muted"}`} id="architecture-generation-prompt-count" role={promptTooLong ? "alert" : undefined}>
              {review.prompt.length.toLocaleString()} / {ARCHITECTURE_GENERATION_PROMPT_LIMIT.toLocaleString()} characters{promptTooLong ? ". Shorten the description to generate." : ""}
            </p>
            {voice.status === "idle" || voice.status === "transcript-ready" || voice.status === "error" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className={secondaryButton} disabled={!voiceSupported || review.status === "loading" || review.status === "review"} onClick={onSpeak} type="button">{transcriptMode ? "Record again" : "Speak"}</button>
                {transcriptMode && voice.status !== "error" ? <button className={secondaryButton} onClick={onVoiceDiscard} type="button">Discard transcript</button> : null}
              </div>
            ) : null}
            {!voiceSupported ? <p className="mt-2 text-xs text-text-secondary">Voice recording is unavailable here. You can still type your description.</p> : null}
            {voiceSupported && !voiceBusy && review.status !== "review" ? <p className="mt-2 text-xs text-text-muted">Audio is sent for transcription only after you stop recording. Review the text before generating.</p> : null}
            {voice.status === "requesting-permission" ? <div className="mt-3" role="status"><p className="text-sm text-text-secondary">Waiting for microphone permission…</p><button className={`${secondaryButton} mt-2`} onClick={onVoiceCancel} type="button">Cancel recording</button></div> : null}
            {voice.status === "recording" ? <div className="mt-3" role="group" aria-label="Voice recording controls">
              <p className="text-sm font-semibold text-text-primary" role="status">Recording</p>
              <p aria-live="off" className="mt-1 font-mono text-sm text-text-secondary">{minutes}:{seconds} / 2:00</p>
              {voice.warning ? <p className="mt-1 text-sm text-danger" role="alert">Recording will stop in 10 seconds.</p> : null}
              {voiceExitMessage ? <p className="mt-1 text-sm text-danger" role="alert">{voiceExitMessage}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2"><button className={primaryButton} id="voice-stop-recording" onClick={onVoiceStop} type="button">Stop</button><button className={secondaryButton} onClick={onVoiceCancel} type="button">Cancel recording</button></div>
            </div> : null}
            {voice.status === "transcribing" ? <div className="mt-3" role="status"><p className="text-sm text-text-secondary">Transcribing…</p><div className="mt-2 flex flex-wrap gap-2"><button className={secondaryButton} onClick={onVoiceCancel} type="button">Cancel transcription</button><button className={secondaryButton} onClick={onSpeak} type="button">Record again</button></div></div> : null}
            {voice.status === "error" ? <div className="mt-3"><p className="text-sm text-danger" role="alert">{voice.message}</p><div className="mt-2 flex flex-wrap gap-2">{voice.retryableAudio ? <button className={secondaryButton} onClick={onVoiceRetry} type="button">Retry transcription</button> : null}<button className={secondaryButton} onClick={onVoiceCancel} type="button">Cancel voice</button>{transcriptMode ? <button className={secondaryButton} onClick={onVoiceDiscard} type="button">Discard transcript</button> : null}</div></div> : null}
            {voice.status === "transcript-ready" ? <p className="mt-2 text-xs text-text-secondary" role="status">Transcript ready. Edit it, then select Generate.</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {review.status === "loading" ? (
                <span className="text-sm text-text-secondary" role="status">Generating proposal…</span>
              ) : null}
              {review.status !== "review" ? (
                <button
                  className={review.status === "loading" ? secondaryButton : primaryButton}
                  disabled={review.status !== "loading" && (voiceBusy || promptTooLong)}
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
              <p className="mt-1 text-xs text-text-secondary">This is not a validated design. Apply replaces your current diagram. You can Undo to restore it. Your Design Brief will be kept. Review it against the new architecture after Apply.</p>
              <p className="mt-2 text-sm text-text-primary">{review.proposal.summary}</p>
              <div className="mt-3 space-y-4">
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
    </div>
  );
}
