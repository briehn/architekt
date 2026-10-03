import { describe, expect, it } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  loadLocalArchitectureEditorState,
  type StorageLike,
} from "../persistence/local-architecture-editor-storage";
import {
  addComponentToEditorState,
  createFreshArchitectureEditorState,
} from "./architecture-editor-state";
import { savePendingArchitectureEditorState } from "./architecture-editor-save";
import { replaceDesignContextInEditorState } from "./design-context-editor-state";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  writes = 0;
  failWrites = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    this.writes += 1;
    if (this.failWrites) throw new Error("Storage unavailable");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

function editedState() {
  const initial = createFreshArchitectureEditorState(ArchitectureGraph.empty());
  const added = addComponentToEditorState(initial, {
    id: "api" as ComponentId,
    name: "API",
    kind: "service",
  });
  if (!added.ok) throw new Error("Fixture rejected");
  return { initial, edited: added.state };
}

describe("pending editor save", () => {
  it("writes the latest canonical edit before the debounce fires", () => {
    const storage = new MemoryStorage();
    const { initial, edited } = editedState();

    expect(savePendingArchitectureEditorState(storage, edited, initial)).toEqual({
      status: "saved",
    });
    expect(storage.writes).toBe(1);
    const restored = loadLocalArchitectureEditorState(storage);
    expect(restored.status).toBe("loaded");
    if (restored.status !== "loaded") return;
    expect(restored.state.graph.getComponents().map(({ name }) => name)).toEqual(["API"]);
    expect(restored.state.nodePositions.size).toBe(1);
  });

  it("does not rewrite an unchanged revision", () => {
    const storage = new MemoryStorage();
    const { initial } = editedState();
    expect(savePendingArchitectureEditorState(storage, initial, initial)).toEqual({
      status: "unchanged",
    });
    expect(storage.writes).toBe(0);
  });

  it("reports a failed write so navigation can warn and keeps the saved value intact", () => {
    const storage = new MemoryStorage();
    const { initial, edited } = editedState();
    const storageKey = "architekt:architecture-editor";
    storage.values.set(storageKey, "previous-valid-document");
    storage.failWrites = true;

    expect(savePendingArchitectureEditorState(storage, edited, initial)).toEqual({
      status: "failed",
      error: { type: "storage-unavailable" },
    });
    expect(storage.values.get(storageKey)).toBe("previous-valid-document");
    expect(savePendingArchitectureEditorState(null, edited, initial)).toEqual({
      status: "failed",
      error: { type: "storage-unavailable" },
    });
  });

  it("flushes a context-only edit and leaves the baseline unchanged on failure", () => {
    const storage = new MemoryStorage();
    const initial = createFreshArchitectureEditorState(ArchitectureGraph.empty());
    const replaced = replaceDesignContextInEditorState(initial, {
      ...initial.designContext,
      title: "Context only",
    });
    if (!replaced.ok) throw new Error("Expected accepted context");
    storage.failWrites = true;
    expect(savePendingArchitectureEditorState(storage, replaced.state, initial)).toEqual({
      status: "failed", error: { type: "storage-unavailable" },
    });
    storage.failWrites = false;
    expect(savePendingArchitectureEditorState(storage, replaced.state, initial)).toEqual({ status: "saved" });
    expect(savePendingArchitectureEditorState(storage, replaced.state, replaced.state)).toEqual({ status: "unchanged" });
    const restored = loadLocalArchitectureEditorState(storage);
    if (restored.status !== "loaded") throw new Error("Expected saved context");
    expect(restored.state.designContext.title).toBe("Context only");
    expect(restored.state.graph.getComponents()).toEqual([]);
    expect(storage.writes).toBe(2);
  });
});
