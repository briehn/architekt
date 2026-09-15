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
} satisfies Record<
  ArchitectureComponentKind,
  Readonly<{ label: string; Icon: LucideIcon }>
>;

describe("getComponentKindPresentation", () => {
  it.each(ARCHITECTURE_COMPONENT_KINDS)(
    "maps %s to its approved label and icon",
    (kind) => {
      const presentation = getComponentKindPresentation(kind);
      const expectedPresentation = expectedPresentationByKind[kind];

      expect(presentation.label).toBe(expectedPresentation.label);
      expect(presentation.Icon).toBe(expectedPresentation.Icon);
      expect(getArchitectureNodeAccessibleLabel("Payments API", kind)).toBe(
        `Payments API, ${expectedPresentation.label}`,
      );
    },
  );
});
