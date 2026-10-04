import type { ArchitectureConnectionKind } from "../domain/architecture-connection";
import { getConnectionKindLabel } from "../application/architecture-kind-labels";

export type ConnectionKindPresentation = Readonly<{
  accessibleLabel: string;
  visibleLabel: string | null;
}>;

const connectionKindPresentationByKind = {
  generic: { accessibleLabel: getConnectionKindLabel("generic"), visibleLabel: null },
  "request-response": {
    accessibleLabel: getConnectionKindLabel("request-response"),
    visibleLabel: "Request/response",
  },
  "async-messaging": {
    accessibleLabel: getConnectionKindLabel("async-messaging"),
    visibleLabel: "Async messaging",
  },
  streaming: { accessibleLabel: getConnectionKindLabel("streaming"), visibleLabel: "Streaming" },
  "data-access": {
    accessibleLabel: getConnectionKindLabel("data-access"),
    visibleLabel: "Data access",
  },
} satisfies Record<ArchitectureConnectionKind, ConnectionKindPresentation>;

export function getConnectionKindPresentation(
  kind: ArchitectureConnectionKind,
): ConnectionKindPresentation {
  return connectionKindPresentationByKind[kind];
}

export function getArchitectureEdgeAccessibleLabel(
  sourceName: string,
  targetName: string,
  kind: ArchitectureConnectionKind,
): string {
  return `${sourceName} to ${targetName}, ${getConnectionKindPresentation(kind).accessibleLabel}`;
}
