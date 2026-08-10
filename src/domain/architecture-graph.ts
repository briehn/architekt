import type { ArchitectureComponent } from "./architecture-component";
import type { ArchitectureConnection } from "./architecture-connection";

export type AddComponentRejection = {
  type: "component-id-already-exists";
  componentId: ArchitectureComponent["id"];
};

export type AddComponentResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: AddComponentRejection };

export type RemoveComponentRejection = {
  type: "component-id-does-not-exist";
  componentId: ArchitectureComponent["id"];
};

export type RemoveComponentResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: RemoveComponentRejection };

export type AddConnectionRejection =
  | {
      type: "connection-id-already-exists";
      connectionId: ArchitectureConnection["id"];
    }
  | {
      type: "source-component-id-does-not-exist";
      sourceComponentId: ArchitectureConnection["sourceComponentId"];
    }
  | {
      type: "target-component-id-does-not-exist";
      targetComponentId: ArchitectureConnection["targetComponentId"];
    }
  | {
      type: "source-and-target-component-ids-are-the-same";
      componentId: ArchitectureConnection["sourceComponentId"];
    }
  | {
      type: "connection-already-exists";
      sourceComponentId: ArchitectureConnection["sourceComponentId"];
      targetComponentId: ArchitectureConnection["targetComponentId"];
    };

export type AddConnectionResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: AddConnectionRejection };

export type RemoveConnectionRejection = {
  type: "connection-id-does-not-exist";
  connectionId: ArchitectureConnection["id"];
};

export type RemoveConnectionResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: RemoveConnectionRejection };

export class ArchitectureGraph {
  private constructor(
    private readonly componentsById: ReadonlyMap<
      ArchitectureComponent["id"],
      ArchitectureComponent
    >,
    private readonly connectionsById: ReadonlyMap<
      ArchitectureConnection["id"],
      ArchitectureConnection
    >,
  ) {}

  static empty(): ArchitectureGraph {
    return new ArchitectureGraph(
      new Map<ArchitectureComponent["id"], ArchitectureComponent>(),
      new Map<ArchitectureConnection["id"], ArchitectureConnection>(),
    );
  }

  addComponent(component: ArchitectureComponent): AddComponentResult {
    if (this.componentsById.has(component.id)) {
      return {
        ok: false,
        error: {
          type: "component-id-already-exists",
          componentId: component.id,
        },
      };
    }

    const storedComponent = { ...component };
    return {
      ok: true,
      graph: new ArchitectureGraph(
        new Map(this.componentsById).set(storedComponent.id, storedComponent),
        this.connectionsById,
      ),
    };
  }

  removeComponent(
    componentId: ArchitectureComponent["id"],
  ): RemoveComponentResult {
    const newComponentsById = new Map(this.componentsById);
    if (newComponentsById.delete(componentId)) {
      const newConnectionsById = new Map(this.connectionsById);
      newConnectionsById.forEach((connection, connectionId) => {
        if (
          connection.sourceComponentId === componentId ||
          connection.targetComponentId === componentId
        ) {
          newConnectionsById.delete(connectionId);
        }
      });
      return {
        ok: true,
        graph: new ArchitectureGraph(newComponentsById, newConnectionsById),
      };
    } else {
      return {
        ok: false,
        error: {
          type: "component-id-does-not-exist",
          componentId,
        },
      };
    }
  }

  addConnection(connection: ArchitectureConnection): AddConnectionResult {
    if (this.connectionsById.has(connection.id)) {
      return {
        ok: false,
        error: {
          type: "connection-id-already-exists",
          connectionId: connection.id,
        },
      };
    }
    if (!this.componentsById.has(connection.sourceComponentId)) {
      return {
        ok: false,
        error: {
          type: "source-component-id-does-not-exist",
          sourceComponentId: connection.sourceComponentId,
        },
      };
    }
    if (!this.componentsById.has(connection.targetComponentId)) {
      return {
        ok: false,
        error: {
          type: "target-component-id-does-not-exist",
          targetComponentId: connection.targetComponentId,
        },
      };
    }
    if (connection.sourceComponentId === connection.targetComponentId) {
      return {
        ok: false,
        error: {
          type: "source-and-target-component-ids-are-the-same",
          componentId: connection.sourceComponentId,
        },
      };
    }
    if (
      this.connectionsById
        .values()
        .some(
          (existingConnection) =>
            existingConnection.sourceComponentId ===
              connection.sourceComponentId &&
            existingConnection.targetComponentId ===
              connection.targetComponentId,
        )
    ) {
      return {
        ok: false,
        error: {
          type: "connection-already-exists",
          sourceComponentId: connection.sourceComponentId,
          targetComponentId: connection.targetComponentId,
        },
      };
    }
    const storedConnection = { ...connection };
    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        new Map(this.connectionsById).set(
          storedConnection.id,
          storedConnection,
        ),
      ),
    };
  }

  removeConnection(
    connectionId: ArchitectureConnection["id"],
  ): RemoveConnectionResult {
    if (!this.connectionsById.has(connectionId)) {
      return {
        ok: false,
        error: {
          type: "connection-id-does-not-exist",
          connectionId: connectionId,
        },
      };
    }
    const newConnectionsById = new Map(this.connectionsById);
    newConnectionsById.delete(connectionId);
    return {
      ok: true,
      graph: new ArchitectureGraph(this.componentsById, newConnectionsById),
    };
  }

  getComponents(): ReadonlyArray<Readonly<ArchitectureComponent>> {
    return Array.from(this.componentsById.values(), (component) => ({
      ...component,
    }));
  }

  getConnections(): ReadonlyArray<Readonly<ArchitectureConnection>> {
    return Array.from(this.connectionsById.values(), (connection) => ({
      ...connection,
    }));
  }
}
