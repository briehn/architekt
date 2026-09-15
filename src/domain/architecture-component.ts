import type { ComponentId } from "./identifiers";

export const ARCHITECTURE_COMPONENT_KINDS = [
  "generic",
  "client",
  "service",
  "database",
  "cache",
  "queue",
  "gateway",
  "storage",
  "external-service",
] as const;

export type ArchitectureComponentKind =
  (typeof ARCHITECTURE_COMPONENT_KINDS)[number];

export function isArchitectureComponentKind(
  value: unknown,
): value is ArchitectureComponentKind {
  return (
    typeof value === "string" &&
    ARCHITECTURE_COMPONENT_KINDS.some((kind) => kind === value)
  );
}

export type ArchitectureComponent = {
  id: ComponentId;
  name: string;
  kind: ArchitectureComponentKind;
};
