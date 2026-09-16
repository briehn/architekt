import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_CONNECTION_KINDS,
  isArchitectureConnectionKind,
} from "./architecture-connection";

describe("ArchitectureConnectionKind", () => {
  it("defines exactly the approved canonical vocabulary", () => {
    expect(ARCHITECTURE_CONNECTION_KINDS).toEqual([
      "generic",
      "request-response",
      "async-messaging",
      "streaming",
      "data-access",
    ]);
  });

  it.each(ARCHITECTURE_CONNECTION_KINDS)(
    "accepts the canonical %s kind",
    (kind) => {
      expect(isArchitectureConnectionKind(kind)).toBe(true);
    },
  );

  it.each(["http", "event", "read-write", "", "Generic"])(
    "rejects the unsupported string %j",
    (value) => {
      expect(isArchitectureConnectionKind(value)).toBe(false);
    },
  );

  it.each([null, undefined, 1, true, {}, []])(
    "rejects the non-string value %j",
    (value) => {
      expect(isArchitectureConnectionKind(value)).toBe(false);
    },
  );
});
