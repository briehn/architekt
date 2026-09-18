import { describe, expect, it } from "vitest";

import type {
  ArchitectureComponent,
  ArchitectureComponentKind,
} from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  createArchitectureEditorHistory,
  redoArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import { createArchitectureEditorState } from "./architecture-editor-state";
import {
  COMPONENT_CREATION_KIND_ORDER,
  getNextGeneratedComponentName,
  recordGeneratedComponentCreation,
} from "./component-creation";

const expectedGeneratedNamesByKind = {
  generic: "Generic",
  client: "Client",
  service: "Service",
  "external-service": "External Service",
  database: "Database",
  cache: "Cache",
  queue: "Queue",
  gateway: "Gateway",
  storage: "Storage",
} satisfies Record<ArchitectureComponentKind, string>;

function component(
  id: string,
  name: string,
  kind: ArchitectureComponentKind = "service",
): ArchitectureComponent {
  return { id: id as ComponentId, name, kind };
}

function graphWithComponents(
  components: readonly ArchitectureComponent[],
): ArchitectureGraph {
  return components.reduce((graph, nextComponent) => {
    const result = graph.addComponent(nextComponent);
    if (!result.ok) {
      throw new Error("Test graph could not be created.");
    }

    return result.graph;
  }, ArchitectureGraph.empty());
}

describe("component creation", () => {
  it("uses the approved common-first presentation order", () => {
    expect(COMPONENT_CREATION_KIND_ORDER).toEqual([
      "service",
      "database",
      "cache",
      "queue",
      "client",
      "gateway",
      "storage",
      "external-service",
      "generic",
    ]);
  });

  it.each(Object.entries(expectedGeneratedNamesByKind) as [
    ArchitectureComponentKind,
    string,
  ][])("generates the preferred %s base name", (kind, expectedName) => {
    expect(getNextGeneratedComponentName([], kind)).toBe(expectedName);
  });

  it("allocates the smallest available generated-name slot", () => {
    expect(
      getNextGeneratedComponentName(["Service", "Service 2", "Service 4"], "service"),
    ).toBe("Service 3");
    expect(
      getNextGeneratedComponentName(["Service 2", "Service 3"], "service"),
    ).toBe("Service");
  });

  it("reuses a deleted suffix from the current canonical names", () => {
    expect(
      getNextGeneratedComponentName(["Database", "Database 3"], "database"),
    ).toBe("Database 2");
  });

  it("matches generated names exactly and case-sensitively", () => {
    expect(
      getNextGeneratedComponentName(
        [
          "service",
          "SERVICE",
          "Service 02",
          "Service API",
          "My Service",
          "Service 2 extra",
        ],
        "service",
      ),
    ).toBe("Service");
  });

  it("is deterministic for fresh equivalent name collections", () => {
    const firstNames = ["Cache", "Cache 2", "Cache 4"];
    const secondNames = ["Cache", "Cache 2", "Cache 4"];

    expect(getNextGeneratedComponentName(firstNames, "cache")).toBe("Cache 3");
    expect(getNextGeneratedComponentName(secondNames, "cache")).toBe("Cache 3");
  });

  it.each(COMPONENT_CREATION_KIND_ORDER)(
    "creates %s with its generated name and one history entry",
    (kind) => {
      const history = createArchitectureEditorHistory(
        createArchitectureEditorState(ArchitectureGraph.empty()),
      );
      const result = recordGeneratedComponentCreation(
        history,
        `${kind}-id` as ComponentId,
        kind,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.component).toEqual({
        id: `${kind}-id` as ComponentId,
        name: expectedGeneratedNamesByKind[kind],
        kind,
      });
      expect(result.history.past).toHaveLength(1);
      expect(result.history.present.graph.getComponents()).toEqual([
        result.component,
      ]);
    },
  );

  it("uses the latest history state for repeated component creation", () => {
    const initialHistory = createArchitectureEditorHistory(
      createArchitectureEditorState(ArchitectureGraph.empty()),
    );
    const firstResult = recordGeneratedComponentCreation(
      initialHistory,
      "service-1" as ComponentId,
      "service",
    );
    if (!firstResult.ok) return;
    const secondResult = recordGeneratedComponentCreation(
      firstResult.history,
      "service-2" as ComponentId,
      "service",
    );
    if (!secondResult.ok) return;
    const thirdResult = recordGeneratedComponentCreation(
      secondResult.history,
      "service-3" as ComponentId,
      "service",
    );

    expect(thirdResult).toMatchObject({
      ok: true,
      component: { name: "Service 3", kind: "service" },
    });
  });

  it("preserves the existing max-x placement policy", () => {
    const graph = graphWithComponents([component("api", "API")]);
    const state = createArchitectureEditorState(graph);
    const history = createArchitectureEditorHistory({
      ...state,
      nodePositions: new Map([["api" as ComponentId, { x: 120, y: 48 }]]),
    });
    const result = recordGeneratedComponentCreation(
      history,
      "database" as ComponentId,
      "database",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.history.present.nodePositions.get("database" as ComponentId)).toEqual({
      x: 360,
      y: 0,
    });
  });

  it("undoes and redoes one created component as one ordinary history entry", () => {
    const initialHistory = createArchitectureEditorHistory(
      createArchitectureEditorState(ArchitectureGraph.empty()),
    );
    const creation = recordGeneratedComponentCreation(
      initialHistory,
      "queue" as ComponentId,
      "queue",
    );
    if (!creation.ok) return;

    const undone = undoArchitectureEditorHistory(creation.history);
    const redone = redoArchitectureEditorHistory(undone);

    expect(undone.present.graph.getComponents()).toEqual([]);
    expect(redone.present.graph.getComponents()).toEqual([creation.component]);
  });

  it("does not create history when the existing editor operation rejects", () => {
    const graph = graphWithComponents([component("existing", "Service")]);
    const history = createArchitectureEditorHistory(
      createArchitectureEditorState(graph),
    );
    const result = recordGeneratedComponentCreation(
      history,
      "existing" as ComponentId,
      "service",
    );

    expect(result).toEqual({
      ok: false,
      error: {
        type: "component-id-already-exists",
        componentId: "existing" as ComponentId,
      },
    });
    expect(history.past).toEqual([]);
    expect(history.present.graph).toBe(graph);
  });

  it("does not make generated-name uniqueness a domain invariant", () => {
    const graph = graphWithComponents([
      component("service-1", "Service"),
      component("service-2", "Service"),
    ]);
    const history = createArchitectureEditorHistory(
      createArchitectureEditorState(graph),
    );
    const result = recordGeneratedComponentCreation(
      history,
      "service-3" as ComponentId,
      "service",
    );

    expect(result).toMatchObject({
      ok: true,
      component: { name: "Service 2", kind: "service" },
    });
  });
});
