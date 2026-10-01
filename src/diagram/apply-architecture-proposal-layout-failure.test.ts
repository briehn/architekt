import { describe, expect, it, vi } from "vitest";

vi.mock("./auto-layout", () => ({
  layoutArchitectureGraph: () => ({ ok: false, error: { type: "layout-failed" } }),
}));

import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { applyArchitectureProposal } from "./apply-architecture-proposal";
import { createArchitectureEditorHistory } from "./architecture-editor-history";
import { createArchitectureEditorState } from "./architecture-editor-state";

describe("proposal Apply layout failure", () => {
  it("leaves the workspace and history untouched", () => {
    const history = createArchitectureEditorHistory(createArchitectureEditorState(ArchitectureGraph.empty()));
    const result = applyArchitectureProposal(history, minimalProposal(), {
      createComponentId: (() => { let id = 0; return () => `component-${++id}` as ComponentId; })(),
      createConnectionId: (() => { let id = 0; return () => `connection-${++id}` as ConnectionId; })(),
    });
    expect(result).toEqual({ ok: false, error: "layout-failed" });
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.present.graph.getComponents()).toEqual([]);
  });
});
