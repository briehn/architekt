import {
  Box,
  Database,
  ExternalLink,
  HardDrive,
  ListOrdered,
  MemoryStick,
  Monitor,
  Network,
  Server,
  type LucideIcon,
} from "lucide-react";

import type { ArchitectureComponentKind } from "../domain/architecture-component";

export type ComponentKindPresentation = Readonly<{
  label: string;
  Icon: LucideIcon;
}>;

const componentKindPresentationByKind = {
  generic: { label: "Generic", Icon: Box },
  client: { label: "Client", Icon: Monitor },
  service: { label: "Service", Icon: Server },
  database: { label: "Database", Icon: Database },
  cache: { label: "Cache", Icon: MemoryStick },
  queue: { label: "Queue", Icon: ListOrdered },
  gateway: { label: "Gateway", Icon: Network },
  storage: { label: "Storage", Icon: HardDrive },
  "external-service": {
    label: "External service",
    Icon: ExternalLink,
  },
} satisfies Record<ArchitectureComponentKind, ComponentKindPresentation>;

export function getComponentKindPresentation(
  kind: ArchitectureComponentKind,
): ComponentKindPresentation {
  return componentKindPresentationByKind[kind];
}

export function getArchitectureNodeAccessibleLabel(
  name: string,
  kind: ArchitectureComponentKind,
): string {
  return `${name}, ${getComponentKindPresentation(kind).label}`;
}
