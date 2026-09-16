import { describe, expect, it } from "vitest";

import { ARCHITECTURE_CONNECTION_KINDS } from "../domain/architecture-connection";
import {
  getArchitectureEdgeAccessibleLabel,
  getConnectionKindPresentation,
} from "./connection-kind-presentation";

const expectedPresentationByKind = {
  generic: { accessibleLabel: "Generic", visibleLabel: null },
  "request-response": {
    accessibleLabel: "Request/response",
    visibleLabel: "Request/response",
  },
  "async-messaging": {
    accessibleLabel: "Async messaging",
    visibleLabel: "Async messaging",
  },
  streaming: { accessibleLabel: "Streaming", visibleLabel: "Streaming" },
  "data-access": {
    accessibleLabel: "Data access",
    visibleLabel: "Data access",
  },
} satisfies Record<
  (typeof ARCHITECTURE_CONNECTION_KINDS)[number],
  Readonly<{ accessibleLabel: string; visibleLabel: string | null }>
>;

describe("getConnectionKindPresentation", () => {
  it.each(ARCHITECTURE_CONNECTION_KINDS)(
    "maps %s to its approved visible and accessible labels",
    (kind) => {
      const expectedPresentation = expectedPresentationByKind[kind];

      expect(getConnectionKindPresentation(kind)).toEqual(
        expectedPresentation,
      );
      expect(
        getArchitectureEdgeAccessibleLabel("API", "Database", kind),
      ).toBe(`API to Database, ${expectedPresentation.accessibleLabel}`);
    },
  );
});
