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
import { describe, expect, it } from "vitest";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import {
  getArchitectureNodeAccessibleLabel,
  getComponentKindPresentation,
} from "./component-kind-presentation";

const expectedPresentationByKind = {
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
} satisfies Record<
  ArchitectureComponentKind,
  Readonly<{ label: string; generatedName: string; Icon: LucideIcon }>
>;

describe("getComponentKindPresentation", () => {
  it.each(ARCHITECTURE_COMPONENT_KINDS)(
    "maps %s to its approved label and icon",
    (kind) => {
      const presentation = getComponentKindPresentation(kind);
      const expectedPresentation = expectedPresentationByKind[kind];

      expect(presentation.label).toBe(expectedPresentation.label);
      expect(presentation.generatedName).toBe(expectedPresentation.generatedName);
      expect(presentation.Icon).toBe(expectedPresentation.Icon);
      expect(getArchitectureNodeAccessibleLabel("Payments API", kind)).toBe(
        `Payments API, ${expectedPresentation.label}`,
      );
    },
  );
});
