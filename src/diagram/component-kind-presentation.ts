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
  generatedName: string;
  Icon: LucideIcon;
}>;

const componentKindPresentationByKind = {
  generic: { label: "Generic", generatedName: "Generic", Icon: Box },
  client: { label: "Client", generatedName: "Client", Icon: Monitor },
  service: { label: "Service", generatedName: "Service", Icon: Server },
  database: { label: "Database", generatedName: "Database", Icon: Database },
  cache: { label: "Cache", generatedName: "Cache", Icon: MemoryStick },
  queue: { label: "Queue", generatedName: "Queue", Icon: ListOrdered },
  gateway: { label: "Gateway", generatedName: "Gateway", Icon: Network },
  storage: { label: "Storage", generatedName: "Storage", Icon: HardDrive },
  "external-service": {
    label: "External service",
    generatedName: "External Service",
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
