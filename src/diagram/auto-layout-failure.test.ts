import { describe, expect, it, vi } from "vitest";

vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const dagre = await importOriginal<typeof import("@dagrejs/dagre")>();

  return {
    ...dagre,
    layout: () => {
      throw new Error("Simulated Dagre failure.");
    },
  };
});

import type { ArchitectureComponent } from "../domain/architecture-component";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import { layoutArchitectureGraph } from "./auto-layout";

describe("layoutArchitectureGraph failure handling", () => {
  it("normalizes an unexpected engine failure without leaking its error", () => {
    const architectureComponent: ArchitectureComponent = {
      id: "api" as ComponentId,
      name: "API",
      kind: "service",
    };
    const addResult = ArchitectureGraph.empty().addComponent(
      architectureComponent,
    );

    if (!addResult.ok) {
      throw new Error("Expected the component to be added.");
    }

    expect(layoutArchitectureGraph(addResult.graph, new Map())).toEqual({
      ok: false,
      error: { type: "layout-failed" },
    });
  });
});
