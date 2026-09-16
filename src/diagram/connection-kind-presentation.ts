import type { ArchitectureConnectionKind } from "../domain/architecture-connection";

export type ConnectionKindPresentation = Readonly<{
  accessibleLabel: string;
  visibleLabel: string | null;
}>;

const connectionKindPresentationByKind = {
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
