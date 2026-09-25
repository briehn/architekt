import { describe, expect, it, vi } from "vitest";

import { ArchitectureGraph } from "../domain/architecture-graph";
import type { ComponentId, ConnectionId } from "../domain/identifiers";
import { addConnectionToEditorState, createArchitectureEditorState } from "./architecture-editor-state";
import {
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
} from "./architecture-editor-history";
import {
  ANCHOR_KEYBOARD_INSTRUCTIONS,
  applyAnchorKeyboardAction,
  getAnchorSideForArrowKey,
  getConnectionAnchorAccessibleName,
} from "./anchor-keyboard-interaction";
import { activatePointerConnectionAnchor } from "./pointer-connection-controller";
import { toArchitectureConnectionFromIntent } from "./react-flow-adapter";

describe("anchor keyboard interaction", () => {
  it.each([
    ["ArrowUp", "top"],
    ["ArrowRight", "right"],
    ["ArrowDown", "bottom"],
    ["ArrowLeft", "left"],
  ] as const)("maps %s to the %s side", (key, side) => {
    expect(getAnchorSideForArrowKey(key)).toBe(side);
  });

  it("leaves Tab, Escape, and unrelated keys to their existing handlers", () => {
    for (const key of ["Tab", "Escape", "Enter", " ", "a"]) {
      expect(getAnchorSideForArrowKey(key)).toBeNull();
    }
  });

  it("selects the requested side without activating and leaves Tab untrapped", () => {
    const selectedSides: string[] = [];
    const activate = vi.fn();

    expect(applyAnchorKeyboardAction(
      "ArrowUp", false, (side) => selectedSides.push(side), activate,
    )).toBe(true);
    expect(selectedSides).toEqual(["top"]);
    expect(activate).not.toHaveBeenCalled();
    expect(applyAnchorKeyboardAction(
      "Tab", false, (side) => selectedSides.push(side), activate,
    )).toBe(false);
    expect(selectedSides).toEqual(["top"]);
  });

  it.each(["Enter", " "])("activates once with %s and ignores key repeat", (key) => {
    const activate = vi.fn();

    expect(applyAnchorKeyboardAction(key, false, vi.fn(), activate)).toBe(true);
    expect(applyAnchorKeyboardAction(key, true, vi.fn(), activate)).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("uses Enter and Space to create one Generic connection through normal history", () => {
    const sourceId = "service" as ComponentId;
    const targetId = "cache" as ComponentId;
    const source = ArchitectureGraph.empty().addComponent({
      id: sourceId, name: "Service", kind: "service",
    });
    if (!source.ok) throw new Error("Expected source component.");
    const target = source.graph.addComponent({
      id: targetId, name: "Cache", kind: "cache",
    });
    if (!target.ok) throw new Error("Expected target component.");
    const initialHistory = createArchitectureEditorHistory(
      createArchitectureEditorState(target.graph),
    );
    let pending = null as ReturnType<typeof activatePointerConnectionAnchor>["pendingSource"];
    let intent = null as ReturnType<typeof activatePointerConnectionAnchor>["connectionIntent"];

    applyAnchorKeyboardAction("Enter", false, vi.fn(), () => {
      const activation = activatePointerConnectionAnchor(pending, sourceId, "top");
      pending = activation.pendingSource;
      intent = activation.connectionIntent;
    });
    expect(pending).toEqual({ componentId: sourceId, side: "top" });
    expect(intent).toBeNull();
    expect(initialHistory.past).toHaveLength(0);

    applyAnchorKeyboardAction(" ", false, vi.fn(), () => {
      const activation = activatePointerConnectionAnchor(pending, targetId, "bottom");
      pending = activation.pendingSource;
      intent = activation.connectionIntent;
    });
    expect(pending).toBeNull();
    if (intent === null) throw new Error("Expected connection intent.");
    const connection = toArchitectureConnectionFromIntent(
      intent, "keyboard-service-cache" as ConnectionId,
    );
    const result = addConnectionToEditorState(initialHistory.present, connection);
    if (!result.ok) throw new Error("Expected accepted connection.");
    const history = recordArchitectureEditorState(initialHistory, result.state);

    expect(connection).toEqual({
      id: "keyboard-service-cache",
      sourceComponentId: sourceId,
      targetComponentId: targetId,
      kind: "generic",
    });
    expect(history.past).toHaveLength(1);
    expect(history.present.graph.getConnections()).toEqual([connection]);
  });

  it("uses Space then Enter for the reverse direction and treats sides as presentation", () => {
    const sourceId = "cache" as ComponentId;
    const targetId = "service" as ComponentId;
    let pending = null as ReturnType<typeof activatePointerConnectionAnchor>["pendingSource"];
    let intent = null as ReturnType<typeof activatePointerConnectionAnchor>["connectionIntent"];

    applyAnchorKeyboardAction(" ", false, vi.fn(), () => {
      const result = activatePointerConnectionAnchor(pending, sourceId, "left");
      pending = result.pendingSource;
    });
    applyAnchorKeyboardAction("Enter", false, vi.fn(), () => {
      const result = activatePointerConnectionAnchor(pending, targetId, "right");
      pending = result.pendingSource;
      intent = result.connectionIntent;
    });

    expect(pending).toBeNull();
    expect(intent).toEqual({
      sourceComponentId: sourceId,
      targetComponentId: targetId,
    });
    expect(intent).not.toHaveProperty("sourceSide");
    expect(intent).not.toHaveProperty("targetSide");
  });

  it("switches the pending source side with Enter without a self-connection intent", () => {
    const serviceId = "service" as ComponentId;
    const graphResult = ArchitectureGraph.empty().addComponent({
      id: serviceId, name: "Service", kind: "service",
    });
    if (!graphResult.ok) throw new Error("Expected service component.");
    const initialHistory = createArchitectureEditorHistory(
      createArchitectureEditorState(graphResult.graph),
    );
    let pending = activatePointerConnectionAnchor(
      null, serviceId, "right",
    ).pendingSource;
    let intent = null as ReturnType<typeof activatePointerConnectionAnchor>["connectionIntent"];

    applyAnchorKeyboardAction("ArrowUp", false, (side) => {
      expect(side).toBe("top");
    }, vi.fn());
    applyAnchorKeyboardAction("Enter", false, vi.fn(), () => {
      const result = activatePointerConnectionAnchor(pending, serviceId, "top");
      pending = result.pendingSource;
      intent = result.connectionIntent;
    });

    expect(pending).toEqual({ componentId: serviceId, side: "top" });
    expect(intent).toBeNull();
    expect(initialHistory.past).toHaveLength(0);
    expect(initialHistory.present.graph.getConnections()).toEqual([]);
  });

  it("names start, destination, and same-source side changes without implying ports", () => {
    expect(getConnectionAnchorAccessibleName(
      "Service", "top", null, false,
    )).toBe("Start connection from Service, top.");
    expect(getConnectionAnchorAccessibleName(
      "Database", "left", "Service", false,
    )).toBe("Connect Service to Database, left.");
    expect(getConnectionAnchorAccessibleName(
      "Service", "bottom", "Service", true,
    )).toBe("Change connection start for Service to bottom.");
  });

  it("provides one concise shared instruction string", () => {
    expect(ANCHOR_KEYBOARD_INSTRUCTIONS).toBe(
      "Use arrow keys to choose a connection side. Press Enter or Space to start or complete a connection. Press Escape to cancel.",
    );
  });
});
