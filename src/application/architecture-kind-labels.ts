import type { ArchitectureComponentKind } from "../domain/architecture-component";
import type { ArchitectureConnectionKind } from "../domain/architecture-connection";

const componentKindLabels = {
  generic: "Generic",
  client: "Client",
  service: "Service",
  database: "Database",
  cache: "Cache",
  queue: "Queue",
  gateway: "Gateway",
  storage: "Storage",
  "external-service": "External service",
} satisfies Record<ArchitectureComponentKind, string>;

const connectionKindLabels = {
  generic: "Generic",
  "request-response": "Request/response",
  "async-messaging": "Async messaging",
  streaming: "Streaming",
  "data-access": "Data access",
} satisfies Record<ArchitectureConnectionKind, string>;

export function getComponentKindLabel(kind: ArchitectureComponentKind): string {
  return componentKindLabels[kind];
}

export function getConnectionKindLabel(kind: ArchitectureConnectionKind): string {
  return connectionKindLabels[kind];
}
