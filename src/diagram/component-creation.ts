import type { ArchitectureComponent, ArchitectureComponentKind } from "../domain/architecture-component";
import type { AddComponentRejection } from "../domain/architecture-graph";
import type { ComponentId } from "../domain/identifiers";
import {
  recordArchitectureEditorState,
  type ArchitectureEditorHistory,
} from "./architecture-editor-history";
import { addComponentToEditorState } from "./architecture-editor-state";
import { getComponentKindPresentation } from "./component-kind-presentation";

export const COMPONENT_CREATION_KIND_ORDER = [
  "service",
  "database",
  "cache",
  "queue",
  "client",
  "gateway",
  "storage",
  "external-service",
  "generic",
] as const satisfies readonly ArchitectureComponentKind[];

export type RecordGeneratedComponentCreationResult =
  | {
      readonly ok: true;
      readonly component: ArchitectureComponent;
      readonly history: ArchitectureEditorHistory;
    }
  | { readonly ok: false; readonly error: AddComponentRejection };

export function getNextGeneratedComponentName(
  currentComponentNames: Iterable<string>,
  kind: ArchitectureComponentKind,
): string {
  const baseName = getComponentKindPresentation(kind).generatedName;
  const suffixExpression = new RegExp(
    `^${escapeRegularExpression(baseName)} ([1-9]\\d*)$`,
  );
  const occupiedSlots = new Set<number>();

  for (const name of currentComponentNames) {
    if (name === baseName) {
      occupiedSlots.add(1);
      continue;
    }

    const suffixMatch = suffixExpression.exec(name);
    if (suffixMatch === null) {
      continue;
    }

    const slot = Number(suffixMatch[1]);
    if (Number.isSafeInteger(slot) && slot >= 2) {
      occupiedSlots.add(slot);
    }
  }

  let slot = 1;
  while (occupiedSlots.has(slot)) {
    slot += 1;
  }

  return slot === 1 ? baseName : `${baseName} ${slot}`;
}

export function recordGeneratedComponentCreation(
  history: ArchitectureEditorHistory,
  componentId: ComponentId,
  kind: ArchitectureComponentKind,
): RecordGeneratedComponentCreationResult {
  const component: ArchitectureComponent = {
    id: componentId,
    name: getNextGeneratedComponentName(
      history.present.graph.getComponents().map((existing) => existing.name),
      kind,
    ),
    kind,
  };
  const result = addComponentToEditorState(history.present, component);

  return result.ok
    ? {
        ok: true,
        component,
        history: recordArchitectureEditorState(history, result.state),
      }
    : result;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
