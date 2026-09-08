import { describe, expect, it } from "vitest";

import {
  getArchitectureEditorHistoryNavigationAction,
  type ArchitectureEditorKeyboardShortcut,
} from "./architecture-editor-keyboard-shortcuts";

function shortcut(
  overrides: Partial<ArchitectureEditorKeyboardShortcut>,
): ArchitectureEditorKeyboardShortcut {
  return {
    key: "z",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    originatesFromEditableElement: false,
    ...overrides,
  };
}

describe("getArchitectureEditorHistoryNavigationAction", () => {
  it("maps Ctrl+Z and Cmd+Z to undo", () => {
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ ctrlKey: true }),
      ),
    ).toBe("undo");
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ key: "Z", metaKey: true }),
      ),
    ).toBe("undo");
  });

  it("maps Ctrl/Cmd+Shift+Z and Ctrl+Y to redo", () => {
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("redo");
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ metaKey: true, shiftKey: true }),
      ),
    ).toBe("redo");
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ key: "y", ctrlKey: true }),
      ),
    ).toBe("redo");
  });

  it("does not treat Cmd+Y as an editor shortcut", () => {
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ key: "y", metaKey: true }),
      ),
    ).toBeNull();
  });

  it("ignores shortcuts with Alt or without Ctrl/Cmd", () => {
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({ ctrlKey: true, altKey: true }),
      ),
    ).toBeNull();
    expect(
      getArchitectureEditorHistoryNavigationAction(shortcut({})),
    ).toBeNull();
  });

  it("ignores shortcuts originating from editable elements", () => {
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({
          ctrlKey: true,
          originatesFromEditableElement: true,
        }),
      ),
    ).toBeNull();
    expect(
      getArchitectureEditorHistoryNavigationAction(
        shortcut({
          key: "y",
          ctrlKey: true,
          originatesFromEditableElement: true,
        }),
      ),
    ).toBeNull();
  });
});
