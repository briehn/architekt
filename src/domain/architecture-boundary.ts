import type { BoundaryId, ComponentId } from "./identifiers";

export type ArchitectureBoundary = Readonly<{
  id: BoundaryId;
  name: string;
  memberComponentIds: readonly ComponentId[];
}>;
