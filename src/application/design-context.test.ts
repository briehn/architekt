import { describe, expect, it } from "vitest";

import {
  EMPTY_DESIGN_CONTEXT,
  hasDesignContextContent,
  validateDesignContext,
  type DesignContext,
} from "./design-context";

const fields = [
  "requirementsAndConstraints",
  "assumptionsAndOpenQuestions",
  "decisionsAndTradeoffs",
] as const;

describe("DesignContext validation", () => {
  it("uses one canonical empty context", () => {
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT })).toEqual({
      ok: true,
      context: EMPTY_DESIGN_CONTEXT,
    });
    const result = validateDesignContext({ ...EMPTY_DESIGN_CONTEXT });
    if (!result.ok) throw new Error("Expected valid context");
    expect(result.context).toBe(EMPTY_DESIGN_CONTEXT);
    expect(hasDesignContextContent(result.context)).toBe(false);
  });

  it("accepts exact UTF-16 limits without trimming and owns submitted data", () => {
    const submitted: DesignContext = {
      title: "T".repeat(120),
      requirementsAndConstraints: "R".repeat(5000),
      assumptionsAndOpenQuestions: "A".repeat(5000),
      decisionsAndTradeoffs: "D".repeat(5000),
    };
    const result = validateDesignContext(submitted);
    if (!result.ok) throw new Error("Expected valid context");
    expect(result.context).toEqual(submitted);
    expect(result.context).not.toBe(submitted);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(hasDesignContextContent(result.context)).toBe(true);
    (submitted as { title: string }).title = "Changed";
    expect(result.context.title).toHaveLength(120);
  });

  it("rejects overlong title and each narrative field without truncating", () => {
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, title: "x".repeat(121) })).toEqual({
      ok: false,
      error: { type: "invalid-field", field: "title", reason: "too-long" },
    });
    for (const field of fields) {
      expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, [field]: "x".repeat(5001) })).toEqual({
        ok: false,
        error: { type: "invalid-field", field, reason: "too-long" },
      });
    }
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, title: "😀".repeat(60) }).ok).toBe(true);
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, title: "😀".repeat(61) })).toEqual({
      ok: false,
      error: { type: "invalid-field", field: "title", reason: "too-long" },
    });
  });

  it("rejects missing, extra, and non-string fields", () => {
    expect(validateDesignContext(null)).toEqual({ ok: false, error: { type: "invalid-shape" } });
    expect(validateDesignContext({ title: "Only title" })).toEqual({ ok: false, error: { type: "invalid-shape" } });
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, extra: true })).toEqual({ ok: false, error: { type: "invalid-shape" } });
    expect(validateDesignContext({ ...EMPTY_DESIGN_CONTEXT, title: 1 })).toEqual({
      ok: false,
      error: { type: "invalid-field", field: "title", reason: "not-string" },
    });
  });
});
