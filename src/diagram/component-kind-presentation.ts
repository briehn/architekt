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

import { getComponentKindLabel } from "../application/architecture-kind-labels";
import type { ArchitectureComponentKind } from "../domain/architecture-component";

export type ComponentKindPresentation = Readonly<{
  label: string;
  generatedName: string;
  Icon: LucideIcon;
}>;

const componentKindPresentationByKind = {
  generic: { label: getComponentKindLabel("generic"), generatedName: "Generic", Icon: Box },
  client: { label: getComponentKindLabel("client"), generatedName: "Client", Icon: Monitor },
  service: { label: getComponentKindLabel("service"), generatedName: "Service", Icon: Server },
  database: { label: getComponentKindLabel("database"), generatedName: "Database", Icon: Database },
  cache: { label: getComponentKindLabel("cache"), generatedName: "Cache", Icon: MemoryStick },
  queue: { label: getComponentKindLabel("queue"), generatedName: "Queue", Icon: ListOrdered },
  gateway: { label: getComponentKindLabel("gateway"), generatedName: "Gateway", Icon: Network },
  storage: { label: getComponentKindLabel("storage"), generatedName: "Storage", Icon: HardDrive },
  "external-service": {
    label: getComponentKindLabel("external-service"),
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
