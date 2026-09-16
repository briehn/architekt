import type { ComponentId, ConnectionId } from "./identifiers";

export const ARCHITECTURE_CONNECTION_KINDS = [
  "generic",
  "request-response",
  "async-messaging",
  "streaming",
  "data-access",
] as const;

export type ArchitectureConnectionKind =
  (typeof ARCHITECTURE_CONNECTION_KINDS)[number];

export function isArchitectureConnectionKind(
  value: unknown,
): value is ArchitectureConnectionKind {
  return (
    typeof value === "string" &&
    ARCHITECTURE_CONNECTION_KINDS.some((kind) => kind === value)
  );
}

export type ArchitectureConnection = {
  id: ConnectionId;
  sourceComponentId: ComponentId;
  targetComponentId: ComponentId;
  kind: ArchitectureConnectionKind;
};
