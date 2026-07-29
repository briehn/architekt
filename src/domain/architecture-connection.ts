import type { ComponentId, ConnectionId } from "./identifiers";

export type ArchitectureConnection = {
  id: ConnectionId;
  sourceComponentId: ComponentId;
  targetComponentId: ComponentId;
};
