export type DesignContext = Readonly<{
  title: string;
  requirementsAndConstraints: string;
  assumptionsAndOpenQuestions: string;
  decisionsAndTradeoffs: string;
}>;

export type DesignContextField = keyof DesignContext;

export type DesignContextValidationError =
  | { type: "invalid-shape" }
  | { type: "invalid-field"; field: DesignContextField; reason: "not-string" | "too-long" };

export type ValidateDesignContextResult =
  | { ok: true; context: DesignContext }
  | { ok: false; error: DesignContextValidationError };

export const EMPTY_DESIGN_CONTEXT: DesignContext = Object.freeze({
  title: "",
  requirementsAndConstraints: "",
  assumptionsAndOpenQuestions: "",
  decisionsAndTradeoffs: "",
});

const FIELD_LIMITS = {
  title: 120,
  requirementsAndConstraints: 5000,
  assumptionsAndOpenQuestions: 5000,
  decisionsAndTradeoffs: 5000,
} as const satisfies Record<DesignContextField, number>;

const FIELDS = Object.keys(FIELD_LIMITS) as DesignContextField[];

export function validateDesignContext(value: unknown): ValidateDesignContextResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: { type: "invalid-shape" } };
  }

  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== FIELDS.length ||
    FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(record, field))) {
    return { ok: false, error: { type: "invalid-shape" } };
  }

  for (const field of FIELDS) {
    if (typeof record[field] !== "string") {
      return { ok: false, error: { type: "invalid-field", field, reason: "not-string" } };
    }
    if (record[field].length > FIELD_LIMITS[field]) {
      return { ok: false, error: { type: "invalid-field", field, reason: "too-long" } };
    }
  }

  if (FIELDS.every((field) => record[field] === "")) {
    return { ok: true, context: EMPTY_DESIGN_CONTEXT };
  }

  const context: DesignContext = Object.freeze({
    title: record.title as string,
    requirementsAndConstraints: record.requirementsAndConstraints as string,
    assumptionsAndOpenQuestions: record.assumptionsAndOpenQuestions as string,
    decisionsAndTradeoffs: record.decisionsAndTradeoffs as string,
  });
  return { ok: true, context };
}

export function areDesignContextsEqual(first: DesignContext, second: DesignContext): boolean {
  return FIELDS.every((field) => first[field] === second[field]);
}

export function hasDesignContextContent(context: DesignContext): boolean {
  return FIELDS.some((field) => context[field].length > 0);
}
