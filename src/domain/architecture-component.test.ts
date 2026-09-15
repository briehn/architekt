import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  isArchitectureComponentKind,
} from "./architecture-component";

describe("ArchitectureComponentKind", () => {
  it("contains exactly the supported component kinds", () => {
    expect(ARCHITECTURE_COMPONENT_KINDS).toEqual([
      "generic",
      "client",
      "service",
      "database",
      "cache",
      "queue",
      "gateway",
      "storage",
      "external-service",
    ]);
  });

  it.each(ARCHITECTURE_COMPONENT_KINDS)(
    "accepts the supported %s kind",
    (kind) => {
      expect(isArchitectureComponentKind(kind)).toBe(true);
    },
  );

  it.each(["other", "Service", "external_service", ""])(
    "rejects the unsupported string %j",
    (value) => {
      expect(isArchitectureComponentKind(value)).toBe(false);
    },
  );

  it.each([undefined, null, 1, true, {}, [], () => undefined])(
    "rejects the non-string value %j",
    (value) => {
      expect(isArchitectureComponentKind(value)).toBe(false);
    },
  );
});
