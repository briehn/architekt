import type { ArchitectureBoundary } from "./architecture-boundary";
import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "./architecture-component";
import type {
  ArchitectureConnection,
  ArchitectureConnectionKind,
} from "./architecture-connection";

export type AddComponentRejection =
  | {
      type: "component-id-already-exists";
      componentId: ArchitectureComponent["id"];
    }
  | {
      type: "component-name-empty";
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

export type RenameComponentRejection =
  | {
      type: "component-id-does-not-exist";
      componentId: ArchitectureComponent["id"];
    }
  | {
      type: "component-name-empty";
      componentId: ArchitectureComponent["id"];
    };

export type RenameComponentResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: RenameComponentRejection };

export type ChangeComponentKindRejection = {
  type: "component-id-does-not-exist";
  componentId: ArchitectureComponent["id"];
};

export type ChangeComponentKindResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: ChangeComponentKindRejection };

export type ChangeConnectionKindRejection = {
  type: "connection-id-does-not-exist";
  connectionId: ArchitectureConnection["id"];
};

export type ChangeConnectionKindResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: ChangeConnectionKindRejection };

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

export type AddBoundaryRejection =
  | {
      type: "boundary-id-already-exists";
      boundaryId: ArchitectureBoundary["id"];
    }
  | {
      type: "boundary-name-empty";
      boundaryId: ArchitectureBoundary["id"];
    }
  | {
      type: "member-component-id-does-not-exist";
      componentId: ArchitectureComponent["id"];
    }
  | {
      type: "duplicate-member-component-id";
      componentId: ArchitectureComponent["id"];
    }
  | {
      type: "member-component-already-in-boundary";
      componentId: ArchitectureComponent["id"];
      boundaryId: ArchitectureBoundary["id"];
    };

export type AddBoundaryResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: AddBoundaryRejection };

export type RenameBoundaryRejection =
  | {
      type: "boundary-id-does-not-exist";
      boundaryId: ArchitectureBoundary["id"];
    }
  | {
      type: "boundary-name-empty";
      boundaryId: ArchitectureBoundary["id"];
    };

export type RenameBoundaryResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: RenameBoundaryRejection };

export type RemoveBoundaryRejection = {
  type: "boundary-id-does-not-exist";
  boundaryId: ArchitectureBoundary["id"];
};

export type RemoveBoundaryResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: RemoveBoundaryRejection };

export type AssignComponentToBoundaryRejection =
  | {
      type: "component-id-does-not-exist";
      componentId: ArchitectureComponent["id"];
    }
  | RemoveBoundaryRejection;

export type AssignComponentToBoundaryResult =
  | { ok: true; graph: ArchitectureGraph }
  | { ok: false; error: AssignComponentToBoundaryRejection };

function compareComponentIds(
  left: ArchitectureComponent["id"],
  right: ArchitectureComponent["id"],
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copyBoundary(boundary: ArchitectureBoundary): ArchitectureBoundary {
  return { ...boundary, memberComponentIds: [...boundary.memberComponentIds] };
}

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
    private readonly boundariesById: ReadonlyMap<
      ArchitectureBoundary["id"],
      ArchitectureBoundary
    >,
  ) {}

  static empty(): ArchitectureGraph {
    return new ArchitectureGraph(
      new Map<ArchitectureComponent["id"], ArchitectureComponent>(),
      new Map<ArchitectureConnection["id"], ArchitectureConnection>(),
      new Map<ArchitectureBoundary["id"], ArchitectureBoundary>(),
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

    if (component.name.trim().length === 0) {
      return {
        ok: false,
        error: {
          type: "component-name-empty",
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
        this.boundariesById,
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
      let nextBoundariesById: ReadonlyMap<ArchitectureBoundary["id"], ArchitectureBoundary> =
        this.boundariesById;
      const containingBoundary = this.findBoundaryContainingComponent(componentId);
      if (containingBoundary) {
        nextBoundariesById = new Map(this.boundariesById).set(
          containingBoundary.id,
          {
            ...containingBoundary,
            memberComponentIds: containingBoundary.memberComponentIds.filter(
              (memberId) => memberId !== componentId,
            ),
          },
        );
      }
      return {
        ok: true,
        graph: new ArchitectureGraph(
          newComponentsById,
          newConnectionsById,
          nextBoundariesById,
        ),
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

  renameComponent(
    componentId: ArchitectureComponent["id"],
    name: ArchitectureComponent["name"],
  ): RenameComponentResult {
    const component = this.componentsById.get(componentId);

    if (!component) {
      return {
        ok: false,
        error: {
          type: "component-id-does-not-exist",
          componentId,
        },
      };
    }

    if (name.trim().length === 0) {
      return {
        ok: false,
        error: {
          type: "component-name-empty",
          componentId,
        },
      };
    }

    if (name === component.name) {
      return { ok: true, graph: this };
    }

    return {
      ok: true,
      graph: new ArchitectureGraph(
        new Map(this.componentsById).set(componentId, {
          ...component,
          name,
        }),
        this.connectionsById,
        this.boundariesById,
      ),
    };
  }

  changeComponentKind(
    componentId: ArchitectureComponent["id"],
    kind: ArchitectureComponentKind,
  ): ChangeComponentKindResult {
    const component = this.componentsById.get(componentId);

    if (!component) {
      return {
        ok: false,
        error: {
          type: "component-id-does-not-exist",
          componentId,
        },
      };
    }

    if (kind === component.kind) {
      return { ok: true, graph: this };
    }

    return {
      ok: true,
      graph: new ArchitectureGraph(
        new Map(this.componentsById).set(componentId, {
          ...component,
          kind,
        }),
        this.connectionsById,
        this.boundariesById,
      ),
    };
  }

  changeConnectionKind(
    connectionId: ArchitectureConnection["id"],
    kind: ArchitectureConnectionKind,
  ): ChangeConnectionKindResult {
    const connection = this.connectionsById.get(connectionId);

    if (!connection) {
      return {
        ok: false,
        error: {
          type: "connection-id-does-not-exist",
          connectionId,
        },
      };
    }

    if (kind === connection.kind) {
      return { ok: true, graph: this };
    }

    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        new Map(this.connectionsById).set(connectionId, {
          ...connection,
          kind,
        }),
        this.boundariesById,
      ),
    };
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
        this.boundariesById,
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
      graph: new ArchitectureGraph(
        this.componentsById,
        newConnectionsById,
        this.boundariesById,
      ),
    };
  }

  addBoundary(boundary: ArchitectureBoundary): AddBoundaryResult {
    if (this.boundariesById.has(boundary.id)) {
      return {
        ok: false,
        error: { type: "boundary-id-already-exists", boundaryId: boundary.id },
      };
    }
    if (boundary.name.trim().length === 0) {
      return {
        ok: false,
        error: { type: "boundary-name-empty", boundaryId: boundary.id },
      };
    }

    const seenMembers = new Set<ArchitectureComponent["id"]>();
    for (const componentId of boundary.memberComponentIds) {
      if (!this.componentsById.has(componentId)) {
        return {
          ok: false,
          error: { type: "member-component-id-does-not-exist", componentId },
        };
      }
      if (seenMembers.has(componentId)) {
        return {
          ok: false,
          error: { type: "duplicate-member-component-id", componentId },
        };
      }
      seenMembers.add(componentId);

      const containingBoundary = this.findBoundaryContainingComponent(componentId);
      if (containingBoundary) {
        return {
          ok: false,
          error: {
            type: "member-component-already-in-boundary",
            componentId,
            boundaryId: containingBoundary.id,
          },
        };
      }
    }

    // Membership is a set; ID ordering gives equivalent input the same representation.
    const storedBoundary: ArchitectureBoundary = {
      id: boundary.id,
      name: boundary.name,
      memberComponentIds: [...seenMembers].sort(compareComponentIds),
    };
    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        this.connectionsById,
        new Map(this.boundariesById).set(storedBoundary.id, storedBoundary),
      ),
    };
  }

  renameBoundary(
    boundaryId: ArchitectureBoundary["id"],
    name: ArchitectureBoundary["name"],
  ): RenameBoundaryResult {
    const boundary = this.boundariesById.get(boundaryId);
    if (!boundary) {
      return {
        ok: false,
        error: { type: "boundary-id-does-not-exist", boundaryId },
      };
    }
    if (name.trim().length === 0) {
      return {
        ok: false,
        error: { type: "boundary-name-empty", boundaryId },
      };
    }
    if (name === boundary.name) {
      return { ok: true, graph: this };
    }

    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        this.connectionsById,
        new Map(this.boundariesById).set(boundaryId, { ...boundary, name }),
      ),
    };
  }

  removeBoundary(boundaryId: ArchitectureBoundary["id"]): RemoveBoundaryResult {
    if (!this.boundariesById.has(boundaryId)) {
      return {
        ok: false,
        error: { type: "boundary-id-does-not-exist", boundaryId },
      };
    }
    const nextBoundariesById = new Map(this.boundariesById);
    nextBoundariesById.delete(boundaryId);
    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        this.connectionsById,
        nextBoundariesById,
      ),
    };
  }

  assignComponentToBoundary(
    componentId: ArchitectureComponent["id"],
    boundaryId: ArchitectureBoundary["id"] | null,
  ): AssignComponentToBoundaryResult {
    if (!this.componentsById.has(componentId)) {
      return {
        ok: false,
        error: { type: "component-id-does-not-exist", componentId },
      };
    }
    const targetBoundary = boundaryId === null
      ? undefined
      : this.boundariesById.get(boundaryId);
    if (boundaryId !== null && !targetBoundary) {
      return {
        ok: false,
        error: { type: "boundary-id-does-not-exist", boundaryId },
      };
    }

    const currentBoundary = this.findBoundaryContainingComponent(componentId);
    if ((currentBoundary?.id ?? null) === boundaryId) {
      return { ok: true, graph: this };
    }

    const nextBoundariesById = new Map(this.boundariesById);
    if (currentBoundary) {
      nextBoundariesById.set(currentBoundary.id, {
        ...currentBoundary,
        memberComponentIds: currentBoundary.memberComponentIds.filter(
          (memberId) => memberId !== componentId,
        ),
      });
    }
    if (targetBoundary) {
      nextBoundariesById.set(targetBoundary.id, {
        ...targetBoundary,
        memberComponentIds: [...targetBoundary.memberComponentIds, componentId].sort(
          compareComponentIds,
        ),
      });
    }

    return {
      ok: true,
      graph: new ArchitectureGraph(
        this.componentsById,
        this.connectionsById,
        nextBoundariesById,
      ),
    };
  }

  private findBoundaryContainingComponent(
    componentId: ArchitectureComponent["id"],
  ): ArchitectureBoundary | undefined {
    for (const boundary of this.boundariesById.values()) {
      if (boundary.memberComponentIds.includes(componentId)) {
        return boundary;
      }
    }
    return undefined;
  }

  getBoundaryById(
    boundaryId: ArchitectureBoundary["id"],
  ): ArchitectureBoundary | undefined {
    const boundary = this.boundariesById.get(boundaryId);
    return boundary ? copyBoundary(boundary) : undefined;
  }

  getBoundaryContainingComponent(
    componentId: ArchitectureComponent["id"],
  ): ArchitectureBoundary | undefined {
    const boundary = this.findBoundaryContainingComponent(componentId);
    return boundary ? copyBoundary(boundary) : undefined;
  }

  getBoundaries(): ReadonlyArray<ArchitectureBoundary> {
    return Array.from(this.boundariesById.values())
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map(copyBoundary);
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
