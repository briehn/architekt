import type { FormEvent } from "react";

import {
  areDesignContextsEqual,
  type DesignContext,
  type DesignContextField,
  type DesignContextValidationError,
} from "../application/design-context";

export type DesignBriefSession = Readonly<{
  baseline: DesignContext;
  draft: DesignContext;
  error: DesignContextValidationError | null;
}>;

export function createDesignBriefSession(context: DesignContext): DesignBriefSession {
  return { baseline: context, draft: context, error: null };
}

export function isDesignBriefDirty(session: DesignBriefSession): boolean {
  return !areDesignContextsEqual(session.draft, session.baseline);
}

export function isDesignBriefStale(session: DesignBriefSession, canonical: DesignContext): boolean {
  return isDesignBriefDirty(session) && !areDesignContextsEqual(session.baseline, canonical);
}

export function reconcileDesignBriefSession(session: DesignBriefSession, canonical: DesignContext): DesignBriefSession {
  return !isDesignBriefDirty(session) && !areDesignContextsEqual(session.baseline, canonical)
    ? createDesignBriefSession(canonical)
    : session;
}

export function updateDesignBriefField(session: DesignBriefSession, field: DesignContextField, value: string): DesignBriefSession {
  return {
    ...session,
    draft: { ...session.draft, [field]: value },
    error: session.error?.type === "invalid-field" && session.error.field === field ? null : session.error,
  };
}

export function getDesignBriefTitle(context: DesignContext): string {
  return context.title === "" ? "Untitled architecture" : context.title;
}

const fields: readonly { field: DesignContextField; label: string; guidance: string; limit: number; multiline: boolean }[] = [
  { field: "title", label: "Title", guidance: "Short name for this architecture.", limit: 120, multiline: false },
  { field: "requirementsAndConstraints", label: "Requirements & constraints", guidance: "What must this system accomplish or respect?", limit: 5000, multiline: true },
  { field: "assumptionsAndOpenQuestions", label: "Assumptions & open questions", guidance: "What are you assuming, and what still needs clarification?", limit: 5000, multiline: true },
  { field: "decisionsAndTradeoffs", label: "Decisions & tradeoffs", guidance: "Record the choice → reason → alternative → downside.", limit: 5000, multiline: true },
];

export function getDesignBriefValidationMessage(error: DesignContextValidationError): string {
  if (error.type === "invalid-shape") return "The brief could not be saved. Review the fields and try again.";
  const label = fields.find(({ field }) => field === error.field)?.label ?? "Field";
  return error.reason === "too-long"
    ? `${label} is too long. Reduce it to ${error.field === "title" ? 120 : 5000} characters or fewer.`
    : `${label} must be text.`;
}

type DesignBriefPanelProps = Readonly<{
  session: DesignBriefSession;
  canonical: DesignContext;
  saveDisabled: boolean;
  onChange(field: DesignContextField, value: string): void;
  onSave(): void;
  onCancel(): void;
  onLoadSaved(): void;
  onKeepDraft(): void;
}>;

export function DesignBriefPanel({ session, canonical, saveDisabled, onChange, onSave, onCancel, onLoadSaved, onKeepDraft }: DesignBriefPanelProps) {
  const stale = isDesignBriefStale(session, canonical);
  const dirty = isDesignBriefDirty(session);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave();
  }

  return (
    <form className="design-brief-form" onSubmit={submit}>
      <p className="text-xs leading-5 text-text-secondary">Capture your intent and reasoning. These notes are yours; Analysis checks only the modeled diagram.</p>
      {stale ? (
        <div className="design-brief-conflict" role="alert">
          <p>The saved Design Brief changed while you were editing. Choose which version to continue with before saving.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="design-brief-secondary" onClick={onLoadSaved} type="button">Load saved brief</button>
            <button className="design-brief-secondary" onClick={onKeepDraft} type="button">Keep my draft</button>
          </div>
        </div>
      ) : null}
      {fields.map(({ field, label, guidance, limit, multiline }) => {
        const id = `design-brief-${field}`;
        const error = session.error?.type === "invalid-field" && session.error.field === field
          ? getDesignBriefValidationMessage(session.error)
          : null;
        const describedBy = `${id}-guidance ${id}-count${error ? ` ${id}-error` : ""}`;
        const controlClass = "design-brief-input";
        return (
          <div className="design-brief-field" key={field}>
            <label className="design-brief-label" htmlFor={id}>{label}</label>
            <p className="design-brief-guidance" id={`${id}-guidance`}>{guidance}</p>
            {multiline ? (
              <textarea aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={controlClass} id={id} onChange={(event) => onChange(field, event.target.value)} rows={field === "decisionsAndTradeoffs" ? 5 : 4} value={session.draft[field]} />
            ) : (
              <input aria-describedby={describedBy} aria-invalid={error ? true : undefined} className={controlClass} id={id} onChange={(event) => onChange(field, event.target.value)} type="text" value={session.draft[field]} />
            )}
            <p className={`design-brief-count ${session.draft[field].length > limit ? "text-danger" : ""}`} id={`${id}-count`}>{session.draft[field].length}/{limit}</p>
            {error ? <p className="mt-1 text-xs text-danger" id={`${id}-error`} role="alert">{error}</p> : null}
          </div>
        );
      })}
      {session.error?.type === "invalid-shape" ? <p className="text-xs text-danger" role="alert">{getDesignBriefValidationMessage(session.error)}</p> : null}
      <div className="design-brief-actions">
        <button className="design-brief-primary" disabled={saveDisabled || stale} type="submit">Save brief</button>
        <button className="design-brief-secondary" onClick={onCancel} type="button">Cancel</button>
      </div>
      {saveDisabled ? <p className="text-xs text-text-secondary" role="status">Finish dragging before saving the brief.</p> : null}
      {!dirty ? <p className="sr-only" role="status">Design Brief has no unsaved changes.</p> : null}
    </form>
  );
}
