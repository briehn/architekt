import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";

export const ANCHOR_KEYBOARD_INSTRUCTIONS_ID =
  "architekt-anchor-keyboard-instructions";

export const ANCHOR_KEYBOARD_INSTRUCTIONS =
  "Use arrow keys to choose a connection side. Press Enter or Space to start or complete a connection. Press Escape to cancel.";

export function getAnchorSideForArrowKey(
  key: string,
): DiagramAnchorSide | null {
  switch (key) {
    case "ArrowUp":
      return "top";
    case "ArrowRight":
      return "right";
    case "ArrowDown":
      return "bottom";
    case "ArrowLeft":
      return "left";
    default:
      return null;
  }
}

export function applyAnchorKeyboardAction(
  key: string,
  repeat: boolean,
  onSelectSide: (side: DiagramAnchorSide) => void,
  onActivate: () => void,
): boolean {
  const side = getAnchorSideForArrowKey(key);
  if (side !== null) {
    onSelectSide(side);
    return true;
  }

  if (key === "Enter" || key === " ") {
    if (!repeat) {
      onActivate();
    }
    return true;
  }

  return false;
}

export function getConnectionAnchorAccessibleName(
  componentName: string,
  side: DiagramAnchorSide,
  pendingSourceName: string | null,
  isPendingSource: boolean,
): string {
  if (pendingSourceName === null) {
    return `Start connection from ${componentName}, ${side}.`;
  }

  return isPendingSource
    ? `Change connection start for ${componentName} to ${side}.`
    : `Connect ${pendingSourceName} to ${componentName}, ${side}.`;
}
