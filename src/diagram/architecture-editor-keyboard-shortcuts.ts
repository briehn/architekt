export type ArchitectureEditorHistoryNavigationAction = "undo" | "redo";

export type ArchitectureEditorKeyboardShortcut = Readonly<{
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  originatesFromEditableElement: boolean;
}>;

export function getArchitectureEditorHistoryNavigationAction(
  shortcut: ArchitectureEditorKeyboardShortcut,
): ArchitectureEditorHistoryNavigationAction | null {
  if (
    shortcut.altKey ||
    shortcut.originatesFromEditableElement ||
    (!shortcut.ctrlKey && !shortcut.metaKey)
  ) {
    return null;
  }

  const key = shortcut.key.toLowerCase();

  if (key === "z") {
    return shortcut.shiftKey ? "redo" : "undo";
  }

  return key === "y" && shortcut.ctrlKey && !shortcut.shiftKey
    ? "redo"
    : null;
}
