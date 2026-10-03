import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EMPTY_DESIGN_CONTEXT, type DesignContext } from "../application/design-context";
import { createArchitectureEditorHistory, recordArchitectureEditorState, redoArchitectureEditorHistory, undoArchitectureEditorHistory } from "./architecture-editor-history";
import { createEmptyArchitectureEditorState } from "./architecture-editor-state";
import { replaceDesignContextInEditorState } from "./design-context-editor-state";
import { createDesignBriefSession, DesignBriefPanel, getDesignBriefTitle, getDesignBriefValidationMessage, isDesignBriefDirty, isDesignBriefStale, reconcileDesignBriefSession, updateDesignBriefField } from "./design-brief-workbench";

const context: DesignContext = { ...EMPTY_DESIGN_CONTEXT, title: "Payments" };

describe("Design Brief workbench", () => {
  it("initializes from canonical context and treats only changed typing as dirty", () => {
    const initial = createDesignBriefSession(context);
    expect(initial.draft).toBe(context);
    expect(isDesignBriefDirty(initial)).toBe(false);
    expect(updateDesignBriefField(initial, "title", "Payments").draft.title).toBe("Payments");
    const edited = updateDesignBriefField(initial, "title", "Checkout");
    expect(isDesignBriefDirty(edited)).toBe(true);
    expect(initial.draft.title).toBe("Payments");
    expect(isDesignBriefDirty(createDesignBriefSession(context))).toBe(false);
  });

  it("refreshes a clean draft after external history change and preserves a dirty draft", () => {
    const clean = createDesignBriefSession(context);
    const changed: DesignContext = { ...context, title: "Updated" };
    expect(reconcileDesignBriefSession(clean, changed)).toEqual(createDesignBriefSession(changed));
    const dirty = updateDesignBriefField(clean, "decisionsAndTradeoffs", "Queue chosen for retries.");
    expect(reconcileDesignBriefSession(dirty, changed)).toBe(dirty);
    expect(isDesignBriefStale(dirty, changed)).toBe(true);
    expect(isDesignBriefStale(dirty, context)).toBe(false);
  });

  it("maps authoritative validation to a field error and does not truncate pasted text", () => {
    const overLimit = updateDesignBriefField(createDesignBriefSession(context), "title", "x".repeat(121));
    expect(overLimit.draft.title).toHaveLength(121);
    const result = replaceDesignContextInEditorState(createEmptyArchitectureEditorState(), overLimit.draft);
    expect(result).toEqual({ ok: false, error: { type: "invalid-field", field: "title", reason: "too-long" } });
    expect(getDesignBriefValidationMessage({ type: "invalid-field", field: "title", reason: "too-long" })).toContain("Title is too long");
  });

  it("presents an empty title as a fallback without changing canonical context", () => {
    expect(getDesignBriefTitle(EMPTY_DESIGN_CONTEXT)).toBe("Untitled architecture");
    expect(getDesignBriefTitle(context)).toBe("Payments");
    expect(EMPTY_DESIGN_CONTEXT.title).toBe("");
  });

  it("renders four labeled controls, feedback, and guarded Save with accessible descriptions", () => {
    const session = { ...createDesignBriefSession(context), error: { type: "invalid-field" as const, field: "title" as const, reason: "too-long" as const } };
    const markup = renderToStaticMarkup(<DesignBriefPanel session={session} canonical={context} saveDisabled={true} onChange={() => {}} onSave={() => {}} onCancel={() => {}} onLoadSaved={() => {}} onKeepDraft={() => {}} />);
    for (const label of ["Title", "Requirements &amp; constraints", "Assumptions &amp; open questions", "Decisions &amp; tradeoffs"]) expect(markup).toContain(label);
    expect(markup).toContain('aria-describedby="design-brief-title-guidance design-brief-title-count design-brief-title-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('maxLength=');
  });

  it("records context-only Save once and leaves graph and positions unchanged through Undo/Redo", () => {
    const initial = createArchitectureEditorHistory(createEmptyArchitectureEditorState());
    const result = replaceDesignContextInEditorState(initial.present, context);
    if (!result.ok) throw new Error("Fixture rejected");
    const saved = recordArchitectureEditorState(initial, result.state);
    expect(saved.past).toHaveLength(1);
    expect(saved.present.graph).toBe(initial.present.graph);
    expect(saved.present.nodePositions).toBe(initial.present.nodePositions);
    expect(undoArchitectureEditorHistory(saved).present.designContext).toBe(EMPTY_DESIGN_CONTEXT);
    expect(redoArchitectureEditorHistory(undoArchitectureEditorHistory(saved)).present.designContext.title).toBe("Payments");
    const unchanged = replaceDesignContextInEditorState(saved.present, context);
    if (!unchanged.ok) throw new Error("Fixture rejected");
    expect(recordArchitectureEditorState(saved, unchanged.state)).toBe(saved);
  });
});
