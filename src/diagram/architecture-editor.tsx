"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Connection, NodeChange } from "@xyflow/react";
import { ChartNoAxesCombined, LayoutGrid, ListTree, Maximize2, PanelsTopLeft, PanelRightClose, Redo2, Sparkles, Undo2, X } from "lucide-react";

import {
  ARCHITECTURE_COMPONENT_KINDS,
  isArchitectureComponentKind,
  type ArchitectureComponent,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import {
  ARCHITECTURE_CONNECTION_KINDS,
  isArchitectureConnectionKind,
  type ArchitectureConnection,
  type ArchitectureConnectionKind,
} from "../domain/architecture-connection";
import {
  type AddComponentRejection,
  type AddConnectionRejection,
  ArchitectureGraph,
} from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";
import {
  clearLocalArchitectureEditorState,
  loadLocalArchitectureEditorState,
  saveLocalArchitectureEditorState,
  type ClearLocalArchitectureEditorStateResult,
  type SaveLocalArchitectureEditorStateResult,
  type StorageLike,
} from "../persistence/local-architecture-editor-storage";
import {
  addConnectionToEditorState,
  applyReactFlowNodeChangesToEditorState,
  autoLayoutArchitectureEditorState,
  changeComponentKindInEditorState,
  changeConnectionKindInEditorState,
  createEmptyArchitectureEditorState,
  createFreshArchitectureEditorState,
  type ArchitectureEditorState,
  renameComponentInEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
  removeBoundaryFromEditorState,
  projectKnownNodeSizes,
} from "./architecture-editor-state";
import { BoundaryCreationForm, BoundaryDetails, BoundaryMembershipSelect, getBoundaryDisplayName } from "./boundary-workbench";
import {
  canEditBoundaries,
  getEligibleBoundaryCreationMembers,
  recordBoundaryCreation,
  recordBoundaryDeletion,
  recordBoundaryMembershipChange,
  recordBoundaryRename,
  type BoundaryEditResult,
} from "./boundary-workbench-actions";
import {
  COMPONENT_CREATION_KIND_ORDER,
  recordGeneratedComponentCreation,
} from "./component-creation";
import {
  canRedoArchitectureEditorHistory,
  canUndoArchitectureEditorHistory,
  commitArchitectureEditorHistoryTransaction,
  createArchitectureEditorHistory,
  recordArchitectureEditorState,
  redoArchitectureEditorHistory,
  replaceArchitectureEditorStateWithoutHistory,
  type ArchitectureEditorHistory,
  undoArchitectureEditorHistory,
} from "./architecture-editor-history";
import {
  getArchitectureEditorHistoryNavigationAction,
  type ArchitectureEditorHistoryNavigationAction,
} from "./architecture-editor-keyboard-shortcuts";
import {
  toArchitectureConnection,
  toArchitectureConnectionFromIntent,
  toReactFlowDiagram,
  withReactFlowNodeMeasurements,
} from "./react-flow-adapter";
import type { CanvasRenamePresentation } from "./architekt-node";
import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";
import { getComponentKindPresentation } from "./component-kind-presentation";
import { getConnectionKindPresentation } from "./connection-kind-presentation";
import {
  activatePointerConnectionAnchor,
  clearDeletedPointerConnectionSource,
  shouldCancelPendingPointerConnectionOnEscape,
  type PendingPointerConnectionSource,
} from "./pointer-connection-controller";
import {
  StaticDiagram,
  type CanvasNodeFocusRequest,
} from "./static-diagram";
import {
  ArchitectureGenerationReviewController,
  type ArchitectureGenerationReviewState,
} from "./architecture-generation-review";
import { applyArchitectureProposal } from "./apply-architecture-proposal";
import { ArchitectureGenerationPanel } from "./architecture-generation-panel";
import { ArchitectureAnalysisPanel } from "./architecture-analysis-panel";
import { toBoundaryFlowNodes } from "./boundary-renderer";
import {
  captureBoundaryMovement,
  moveBoundaryBy,
  translateBoundaryMembers,
  type BoundaryMovementStart,
} from "./boundary-movement";
import type { DiagramPosition } from "./diagram-layout";
import {
  savePendingArchitectureEditorState,
  type PersistedEditorStateBaseline,
} from "./architecture-editor-save";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}

function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function createComponentId(): ComponentId {
  return crypto.randomUUID() as ComponentId;
}

function createConnectionId(): ConnectionId {
  return crypto.randomUUID() as ConnectionId;
}

function createBoundaryId(): BoundaryId {
  return crypto.randomUUID() as BoundaryId;
}

function getAddConnectionErrorMessage(
  error: AddConnectionRejection,
): string {
  switch (error.type) {
    case "source-and-target-component-ids-are-the-same":
      return "A component cannot connect to itself.";
    case "connection-already-exists":
      return "That connection already exists.";
    case "source-component-id-does-not-exist":
    case "target-component-id-does-not-exist":
      return "A connected component no longer exists.";
    case "connection-id-already-exists":
      return "That connection could not be created. Try again.";
  }
}

export function getPendingPointerConnectionStatus(sourceName: string): string {
  return `Connecting from ${sourceName}. Choose a destination.`;
}

export function getPointerConnectionSuccessAnnouncement(
  sourceName: string,
  targetName: string,
): string {
  return `Connected ${sourceName} to ${targetName}.`;
}

function createExampleArchitectureGraph(): ArchitectureGraph {
  const graph = ArchitectureGraph.empty();
  const api: ArchitectureComponent = {
    id: componentId("api"),
    name: "API",
    kind: "service",
  };
  const database: ArchitectureComponent = {
    id: componentId("database"),
    name: "Database",
    kind: "database",
  };
  const apiToDatabase: ArchitectureConnection = {
    id: connectionId("api-to-database"),
    sourceComponentId: api.id,
    targetComponentId: database.id,
    kind: "data-access",
  };

  const apiResult = graph.addComponent(api);
  if (!apiResult.ok) return graph;

  const databaseResult = apiResult.graph.addComponent(database);
  if (!databaseResult.ok) return graph;

  const connectionResult = databaseResult.graph.addConnection(apiToDatabase);
  return connectionResult.ok ? connectionResult.graph : graph;
}

// This module-level value remains stable when position state causes a re-render.
const exampleArchitectureGraph = createExampleArchitectureGraph();

export function createExampleArchitectureEditorState(): ArchitectureEditorState {
  return createFreshArchitectureEditorState(exampleArchitectureGraph);
}

export function createFreshExampleArchitectureEditorHistory(): ArchitectureEditorHistory {
  return createArchitectureEditorHistory(
    createExampleArchitectureEditorState(),
  );
}

type EditableArchitectureEditorViewState = {
  readonly history: ArchitectureEditorHistory;
  readonly connectionRejection: AddConnectionRejection | null;
  readonly announcement?: string;
  readonly componentCreationRejection?: AddComponentRejection | null;
  readonly autoLayoutFailure?: boolean;
  readonly fitViewRequestId?: number;
};

type ArchitectureEditorSaveFailure = Extract<
  SaveLocalArchitectureEditorStateResult,
  { readonly ok: false }
>["error"];

type ArchitectureEditorResetFailure = Extract<
  ClearLocalArchitectureEditorStateResult,
  { readonly ok: false }
>["error"];

type ArchitectureEditorViewState =
  | { readonly status: "loading" }
  | (EditableArchitectureEditorViewState & {
      readonly status: "ready";
      readonly saveFailure: ArchitectureEditorSaveFailure | null;
    })
  | (EditableArchitectureEditorViewState & {
      readonly status: "recovery-required";
      readonly reason:
        | "saved-state-invalid"
        | "unsupported-schema-version";
      readonly resetFailure: ArchitectureEditorResetFailure | null;
    })
  | (EditableArchitectureEditorViewState & {
      readonly status: "memory-only";
    });

type UtilityDockView = "structure" | "analysis" | "ai" | "boundary-create" | "boundary-details" | null;

export type RenameDraft = Readonly<{
  componentId: ComponentId;
  name: string;
  validationMessage: string | null;
}>;

export type RenameOrigin = "list" | "canvas";

export type RenameSession = Readonly<{
  draft: RenameDraft;
  origin: RenameOrigin;
}>;

const AUTOSAVE_DELAY_MILLISECONDS = 300;

export function createRenameDraft(
  componentId: ComponentId,
  name: string,
): RenameDraft {
  return { componentId, name, validationMessage: null };
}

export function updateRenameDraftName(
  draft: RenameDraft,
  name: string,
): RenameDraft {
  return { ...draft, name, validationMessage: null };
}

export function createRenameSession(
  componentId: ComponentId,
  name: string,
  origin: RenameOrigin,
): RenameSession {
  return { draft: createRenameDraft(componentId, name), origin };
}

export function getRenameDraftValidationMessage(
  draft: RenameDraft,
): string | null {
  return draft.validationMessage ??
    (draft.name.trim().length === 0 ? "Enter a component name." : null);
}

export function getArchitectureComponentKindFromSelectValue(
  rawKind: unknown,
): ArchitectureComponentKind | null {
  return isArchitectureComponentKind(rawKind) ? rawKind : null;
}

export function getArchitectureConnectionKindFromSelectValue(
  rawKind: unknown,
): ArchitectureConnectionKind | null {
  return isArchitectureConnectionKind(rawKind) ? rawKind : null;
}

function ComponentKindOptions() {
  return ARCHITECTURE_COMPONENT_KINDS.map((kind) => (
    <option key={kind} value={kind}>
      {getComponentKindPresentation(kind).label}
    </option>
  ));
}

function ConnectionKindOptions() {
  return ARCHITECTURE_CONNECTION_KINDS.map((kind) => (
    <option key={kind} value={kind}>
      {getConnectionKindPresentation(kind).accessibleLabel}
    </option>
  ));
}

type ComponentTypePickerProps = Readonly<{
  onAddComponent(kind: ArchitectureComponentKind): void;
}>;

export function ComponentTypePicker({
  onAddComponent,
}: ComponentTypePickerProps) {
  return (
    <div aria-label="Add component" className="workbench-component-picker flex flex-col gap-0.5" role="group">
      {COMPONENT_CREATION_KIND_ORDER.map((kind) => {
        const presentation = getComponentKindPresentation(kind);
        const { Icon } = presentation;

        return (
          <button
            aria-label={`Add ${presentation.generatedName} component`}
            className="flex min-h-10 min-w-0 items-center gap-3 rounded-sm px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            key={kind}
            onClick={() => onAddComponent(kind)}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{presentation.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type ComponentListKindSelectProps = Readonly<{
  accessibleName: string;
  value: ArchitectureComponentKind;
  onKindChange(kind: ArchitectureComponentKind): void;
}>;

export function ComponentListKindSelect({
  accessibleName,
  value,
  onKindChange,
}: ComponentListKindSelectProps) {
  return (
    <select
      aria-label={accessibleName}
      className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 pr-7 text-xs text-text-primary outline-none transition-colors hover:border-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
      onChange={(event) => {
        const kind = getArchitectureComponentKindFromSelectValue(
          event.target.value,
        );

        if (kind !== null) {
          onKindChange(kind);
        }
      }}
      value={value}
    >
      <ComponentKindOptions />
    </select>
  );
}

export function getComponentListKindSelectAccessibleName(
  component: Pick<ArchitectureComponent, "id" | "name">,
  hasDuplicateName: boolean,
): string {
  const componentName = hasDuplicateName
    ? `${component.name} (${component.id})`
    : component.name;

  return `Change type for ${componentName}`;
}

export function recordComponentKindChangeFromList(
  history: ArchitectureEditorHistory,
  componentId: ComponentId,
  kind: ArchitectureComponentKind,
): ArchitectureEditorHistory {
  const result = changeComponentKindInEditorState(
    history.present,
    componentId,
    kind,
  );

  return result.ok
    ? recordArchitectureEditorState(history, result.state)
    : history;
}

export type RecordAutoLayoutFromEditorActionResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly history: ArchitectureEditorHistory;
    }
  | { readonly ok: false; readonly error: { type: "layout-failed" } };

export function canAutoLayoutFromEditorAction(
  editorState: ArchitectureEditorState,
  nodeDragIsActive: boolean,
  inlineRenameIsActive: boolean,
): boolean {
  return (
    editorState.graph.getComponents().length > 0 &&
    !nodeDragIsActive &&
    !inlineRenameIsActive
  );
}

export function recordAutoLayoutFromEditorAction(
  history: ArchitectureEditorHistory,
): RecordAutoLayoutFromEditorActionResult {
  const result = autoLayoutArchitectureEditorState(history.present);

  if (!result.ok) {
    return result;
  }

  const nextHistory = recordArchitectureEditorState(history, result.state);

  return {
    ok: true,
    changed: nextHistory !== history,
    history: nextHistory,
  };
}

export function getAutoLayoutAnnouncement(changed: boolean): string {
  return changed
    ? "Diagram arranged. Undo is available."
    : "Diagram is already arranged.";
}

export const AUTO_LAYOUT_FAILURE_MESSAGE =
  "Could not arrange the diagram. Try again.";


export function getNextAutoLayoutFitRequestId(
  currentRequestId: number,
  layoutChanged: boolean,
): number {
  return layoutChanged ? currentRequestId + 1 : currentRequestId;
}
type AutoLayoutButtonProps = Readonly<{
  disabled: boolean;
  onAutoLayout(): void;
}>;

export function AutoLayoutButton({
  disabled,
  onAutoLayout,
}: AutoLayoutButtonProps) {
  return (
    <button
      aria-label="Auto-layout"
    className="workbench-command"
      disabled={disabled}
      onClick={onAutoLayout}
      type="button"
    >
      <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
      <span>Auto-layout</span>
    </button>
  );
}

type ConnectionListKindSelectProps = Readonly<{
  accessibleName: string;
  value: ArchitectureConnectionKind;
  onKindChange(kind: ArchitectureConnectionKind): void;
}>;

export function ConnectionListKindSelect({
  accessibleName,
  value,
  onKindChange,
}: ConnectionListKindSelectProps) {
  return (
    <select
      aria-label={accessibleName}
      className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 pr-7 text-xs text-text-primary outline-none transition-colors hover:border-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
      onChange={(event) => {
        const kind = getArchitectureConnectionKindFromSelectValue(
          event.target.value,
        );

        if (kind !== null) {
          onKindChange(kind);
        }
      }}
      value={value}
    >
      <ConnectionKindOptions />
    </select>
  );
}

export function getConnectionListKindSelectAccessibleName(
  connection: Pick<
    ArchitectureConnection,
    "sourceComponentId" | "targetComponentId"
  >,
  sourceName: string,
  targetName: string,
  hasAmbiguousEndpointNames: boolean,
): string {
  const source = hasAmbiguousEndpointNames
    ? `${sourceName} (${connection.sourceComponentId})`
    : sourceName;
  const target = hasAmbiguousEndpointNames
    ? `${targetName} (${connection.targetComponentId})`
    : targetName;

  return `Change connection type from ${source} to ${target}`;
}

export function recordConnectionKindChangeFromList(
  history: ArchitectureEditorHistory,
  connectionId: ConnectionId,
  kind: ArchitectureConnectionKind,
): ArchitectureEditorHistory {
  const result = changeConnectionKindInEditorState(
    history.present,
    connectionId,
    kind,
  );

  return result.ok
    ? recordArchitectureEditorState(history, result.state)
    : history;
}

export function recordSelectedComponentDeletion(
  history: ArchitectureEditorHistory,
  componentIds: readonly ComponentId[],
): ArchitectureEditorHistory {
  let nextState = history.present;

  for (const componentId of new Set(componentIds)) {
    const result = removeComponentFromEditorState(nextState, componentId);
    if (result.ok) {
      nextState = result.state;
    }
  }

  return recordArchitectureEditorState(history, nextState);
}

export function applyCanvasNodeSelectionChanges(
  currentSelection: ReadonlySet<ComponentId>,
  changes: readonly NodeChange[],
): ReadonlySet<ComponentId> {
  let nextSelection: Set<ComponentId> | null = null;

  for (const change of changes) {
    if (change.type !== "select") continue;
    nextSelection ??= new Set(currentSelection);
    if (change.selected) {
      nextSelection.add(change.id as ComponentId);
    } else {
      nextSelection.delete(change.id as ComponentId);
    }
  }

  return nextSelection ?? currentSelection;
}

export function canDeleteSelectedCanvasComponents(
  renameActive: boolean,
  dragActive: boolean,
  focusedEditable: boolean,
): boolean {
  return !renameActive && !dragActive && !focusedEditable;
}

function persistedEditorStateBaseline(
  editorState: ArchitectureEditorState,
): PersistedEditorStateBaseline {
  return {
    graph: editorState.graph,
    nodePositions: editorState.nodePositions,
    designContext: editorState.designContext,
  };
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest("input, textarea, select") !== null ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function ArchitectureEditor() {
  const [viewState, setViewState] = useState<ArchitectureEditorViewState>({
    status: "loading",
  });
  const [renameSession, setRenameSession] =
    useState<RenameSession | null>(null);
  const [canvasNodeFocusRequest, setCanvasNodeFocusRequest] =
    useState<CanvasNodeFocusRequest | null>(null);
  const [nodeDragIsActive, setNodeDragIsActive] = useState(false);
  const [pendingPointerConnectionSource, setPendingPointerConnectionSource] =
    useState<PendingPointerConnectionSource | null>(null);
  const [selectedCanvasComponentIds, setSelectedCanvasComponentIds] =
    useState<ReadonlySet<ComponentId>>(() => new Set());
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<BoundaryId | null>(null);
  const [dockView, setDockView] = useState<UtilityDockView>(null);
  const [boundaryCreationPrefill, setBoundaryCreationPrefill] = useState<readonly ComponentId[]>([]);
  const [boundaryCreationSession, setBoundaryCreationSession] = useState(0);
  const [detailsBoundaryId, setDetailsBoundaryId] = useState<BoundaryId | null>(null);
  const [creationLibraryIsOpen, setCreationLibraryIsOpen] = useState(false);
  const [generationReview, setGenerationReview] = useState<ArchitectureGenerationReviewState>({ status: "idle", prompt: "" });
  const generationControllerRef = useRef<ArchitectureGenerationReviewController | null>(null);
  const generationToggleRef = useRef<HTMLButtonElement | null>(null);
  const structureToggleRef = useRef<HTMLButtonElement | null>(null);
  const analysisToggleRef = useRef<HTMLButtonElement | null>(null);
  const creationToggleRef = useRef<HTMLButtonElement | null>(null);
  const boundaryCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dockCloseRef = useRef<HTMLButtonElement | null>(null);
  const creationCloseRef = useRef<HTMLButtonElement | null>(null);
  const storageRef = useRef<StorageLike | null>(null);
  const autosaveBaselineRef = useRef<PersistedEditorStateBaseline | null>(null);
  const latestEditorStateRef = useRef<ArchitectureEditorState | null>(null);
  const dragStartHistoryRef = useRef<ArchitectureEditorHistory | null>(null);
  const boundaryDragRef = useRef<Readonly<{
    start: BoundaryMovementStart;
    rendererStart: DiagramPosition;
  }> | null>(null);
  const latestViewStateRef = useRef<ArchitectureEditorViewState>(viewState);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const nameControlRefs = useRef(
    new Map<ComponentId, HTMLButtonElement>(),
  );
  const nameControlToFocusRef = useRef<ComponentId | null>(null);

  useEffect(() => {
    const controller = new ArchitectureGenerationReviewController(setGenerationReview);
    generationControllerRef.current = controller;
    return () => {
      controller.dispose();
      generationControllerRef.current = null;
    };
  }, []);

  const renameDraft = renameSession?.draft ?? null;
  const activeRenameComponentId = renameDraft?.componentId ?? null;

  const closeRename = useCallback(
    (
      componentId: ComponentId | null,
      focusBehavior: "restore" | "preserve-current" = "restore",
    ) => {
      if (focusBehavior === "restore") {
        if (renameSession?.origin === "canvas" && componentId !== null) {
          setCanvasNodeFocusRequest((currentRequest) => ({
            componentId,
            requestId: (currentRequest?.requestId ?? 0) + 1,
          }));
        } else if (renameSession?.origin === "list") {
          nameControlToFocusRef.current = componentId;
        }
      } else {
        nameControlToFocusRef.current = null;
      }

      setRenameSession(null);
    },
    [renameSession],
  );

  useEffect(() => {
    if (renameSession?.origin === "list" && activeRenameComponentId !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
      return;
    }

    if (renameSession !== null) {
      return;
    }

    const componentId = nameControlToFocusRef.current;
    if (componentId !== null) {
      nameControlRefs.current.get(componentId)?.focus();
      nameControlToFocusRef.current = null;
    }
  }, [activeRenameComponentId, renameSession]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      let storage: Storage;

      try {
        storage = window.localStorage;
      } catch {
        storageRef.current = null;
        autosaveBaselineRef.current = null;
        setViewState({
          status: "memory-only",
          history: createFreshExampleArchitectureEditorHistory(),
          connectionRejection: null,
        });
        return;
      }

      storageRef.current = storage;
      const loadResult = loadLocalArchitectureEditorState(storage);

      if (loadResult.status === "loaded") {
        autosaveBaselineRef.current = persistedEditorStateBaseline(
          loadResult.state,
        );
        setViewState({
          status: "ready",
          history: createArchitectureEditorHistory(loadResult.state),
          connectionRejection: null,
          saveFailure: null,
        });
        return;
      }

      const freshHistory = createFreshExampleArchitectureEditorHistory();
      const editorState = freshHistory.present;

      if (loadResult.status === "missing") {
        autosaveBaselineRef.current = persistedEditorStateBaseline(editorState);
        setViewState({
          status: "ready",
          history: freshHistory,
          connectionRejection: null,
          saveFailure: null,
        });
        return;
      }

      if (loadResult.error.type === "storage-unavailable") {
        storageRef.current = null;
        autosaveBaselineRef.current = null;
        setViewState({
          status: "memory-only",
          history: freshHistory,
          connectionRejection: null,
        });
        return;
      }

      autosaveBaselineRef.current = null;
      setViewState({
        status: "recovery-required",
        reason: loadResult.error.type,
        history: freshHistory,
        connectionRejection: null,
        resetFailure: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    latestViewStateRef.current = viewState;

    if (viewState.status !== "loading") {
      latestEditorStateRef.current = viewState.history.present;
    }
  }, [viewState]);

  const navigateHistory = useCallback(
    (action: ArchitectureEditorHistoryNavigationAction) => {
      const latestViewState = latestViewStateRef.current;

      if (
        latestViewState.status === "loading" ||
        dragStartHistoryRef.current !== null
      ) {
        return false;
      }

      const actionIsAvailable =
        action === "undo"
          ? canUndoArchitectureEditorHistory(latestViewState.history)
          : canRedoArchitectureEditorHistory(latestViewState.history);

      if (!actionIsAvailable) {
        return false;
      }

      setPendingPointerConnectionSource(null);
      setSelectedCanvasComponentIds(new Set());
      setSelectedBoundaryId(null);
      closeRename(activeRenameComponentId);

      setViewState((currentViewState) => {
        if (
          currentViewState.status === "loading" ||
          dragStartHistoryRef.current !== null
        ) {
          return currentViewState;
        }

        const history =
          action === "undo"
            ? undoArchitectureEditorHistory(currentViewState.history)
            : redoArchitectureEditorHistory(currentViewState.history);

        return history === currentViewState.history
          ? currentViewState
          : { ...currentViewState, history };
      });

      return true;
    },
    [activeRenameComponentId, closeRename],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldCancelPendingPointerConnectionOnEscape(
        pendingPointerConnectionSource,
        event.key,
        renameSession !== null,
        isEditableKeyboardTarget(event.target),
      )) {
        event.preventDefault();
        setPendingPointerConnectionSource(null);
        return;
      }

      const action = getArchitectureEditorHistoryNavigationAction({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        originatesFromEditableElement: isEditableKeyboardTarget(event.target),
      });

      if (action !== null && navigateHistory(action)) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigateHistory, pendingPointerConnectionSource, renameSession]);

  useEffect(() => {
    function closeActiveSheetOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (creationLibraryIsOpen && target.closest(".workbench-library")) {
        event.preventDefault();
        setCreationLibraryIsOpen(false);
        creationToggleRef.current?.focus();
      } else if (dockView !== null && target.closest(".workbench-dock")) {
        event.preventDefault();
        setDockView(null);
        if (dockView === "boundary-create") {
          (window.matchMedia("(max-width: 1023px)").matches ? creationToggleRef : boundaryCreateTriggerRef).current?.focus();
        } else {
          (dockView === "ai" ? generationToggleRef : dockView === "analysis" ? analysisToggleRef : structureToggleRef).current?.focus();
        }
      }
    }

    window.addEventListener("keydown", closeActiveSheetOnEscape);
    return () => window.removeEventListener("keydown", closeActiveSheetOnEscape);
  }, [creationLibraryIsOpen, dockView]);

  const persistEditorState = useCallback(
    (editorStateToSave: ArchitectureEditorState) => {
      const storage = storageRef.current;
      const saveResult: SaveLocalArchitectureEditorStateResult = storage
        ? saveLocalArchitectureEditorState(storage, editorStateToSave)
        : {
            ok: false,
            error: { type: "storage-unavailable" },
          };

      if (saveResult.ok) {
        autosaveBaselineRef.current =
          persistedEditorStateBaseline(editorStateToSave);
      }

      setViewState((currentViewState) => {
        if (currentViewState.status !== "ready") {
          return currentViewState;
        }

        if (!saveResult.ok) {
          return {
            ...currentViewState,
            saveFailure: saveResult.error,
          };
        }

        const savedRevisionIsCurrent =
          currentViewState.history.present.graph === editorStateToSave.graph &&
          currentViewState.history.present.nodePositions ===
            editorStateToSave.nodePositions &&
          currentViewState.history.present.designContext ===
            editorStateToSave.designContext;

        if (!savedRevisionIsCurrent || currentViewState.saveFailure === null) {
          return currentViewState;
        }

        return {
          ...currentViewState,
          saveFailure: null,
        };
      });
    },
    [],
  );

  const flushPendingSave = useCallback(() => {
    const currentViewState = latestViewStateRef.current;
    if (currentViewState.status !== "ready") return true;

    const currentEditorState = currentViewState.history.present;
    const result = savePendingArchitectureEditorState(
      storageRef.current,
      currentEditorState,
      autosaveBaselineRef.current,
    );
    if (result.status === "saved") {
      autosaveBaselineRef.current = persistedEditorStateBaseline(currentEditorState);
    } else if (result.status === "failed") {
      setViewState((state) => state.status === "ready"
        ? { ...state, saveFailure: result.error }
        : state);
    }
    return result.status !== "failed";
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!flushPendingSave()) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    function handlePageHide() {
      flushPendingSave();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushPendingSave]);

  const autosaveGraph =
    viewState.status === "ready" ? viewState.history.present.graph : null;
  const autosaveNodePositions =
    viewState.status === "ready"
      ? viewState.history.present.nodePositions
      : null;
  const autosaveDesignContext =
    viewState.status === "ready"
      ? viewState.history.present.designContext
      : null;

  useEffect(() => {
    if (autosaveGraph === null || autosaveNodePositions === null || autosaveDesignContext === null) {
      return;
    }

    const baseline = autosaveBaselineRef.current;
    if (
      baseline?.graph === autosaveGraph &&
      baseline.nodePositions === autosaveNodePositions &&
      baseline.designContext === autosaveDesignContext
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const latestEditorState = latestEditorStateRef.current;
      const latestBaseline = autosaveBaselineRef.current;
      if (
        latestEditorState === null ||
        latestEditorState.graph !== autosaveGraph ||
        latestEditorState.nodePositions !== autosaveNodePositions ||
        latestEditorState.designContext !== autosaveDesignContext ||
        (latestBaseline?.graph === autosaveGraph &&
          latestBaseline.nodePositions === autosaveNodePositions &&
          latestBaseline.designContext === autosaveDesignContext)
      ) {
        return;
      }

      persistEditorState(latestEditorState);
    }, AUTOSAVE_DELAY_MILLISECONDS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autosaveGraph, autosaveNodePositions, autosaveDesignContext, persistEditorState]);

  if (viewState.status === "loading") {
    return (
      <div className="workbench-shell">
        <header className="workbench-command-bar">
          <h1 className="workbench-identity">Architekt</h1>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas px-4" role="status">
          <p className="text-sm text-text-muted">Loading saved workspace…</p>
        </div>
      </div>
    );
  }

  const { history, connectionRejection } = viewState;
  const editorState = history.present;
  const undoIsAvailable =
    !nodeDragIsActive && canUndoArchitectureEditorHistory(history);
  const redoIsAvailable =
    !nodeDragIsActive && canRedoArchitectureEditorHistory(history);
  const autoLayoutIsAvailable = canAutoLayoutFromEditorAction(
    editorState,
    nodeDragIsActive,
    renameSession !== null,
  );
  const { nodes: diagramNodes, edges } = toReactFlowDiagram(
    editorState.graph,
    editorState.nodePositions,
  );
  const nodes = withReactFlowNodeMeasurements(
    diagramNodes,
    editorState.nodeMeasurements,
  );
  const boundaryNodes = toBoundaryFlowNodes(
    editorState.graph,
    editorState.nodePositions,
    projectKnownNodeSizes(editorState),
  );
  const activeSelectedBoundaryId = selectedBoundaryId !== null &&
    editorState.graph.getBoundaryById(selectedBoundaryId)
      ? selectedBoundaryId
      : null;

  function handleNodesChange(changes: NodeChange[]) {
    if (changes.some((change) => change.type === "select")) {
      setSelectedCanvasComponentIds((currentSelection) =>
        applyCanvasNodeSelectionChanges(currentSelection, changes),
      );
      if (changes.some((change) => change.type === "select" && change.selected)) {
        setSelectedBoundaryId(null);
      }
    }

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const nextEditorState = applyReactFlowNodeChangesToEditorState(
        currentViewState.history.present,
        changes,
      );

      const history = replaceArchitectureEditorStateWithoutHistory(
        currentViewState.history,
        nextEditorState,
      );

      return history === currentViewState.history
        ? currentViewState
        : { ...currentViewState, history };
    });
  }

  function handleNodeDragStart() {
    dragStartHistoryRef.current = history;
    setNodeDragIsActive(true);
  }

  function handleNodeDragStop() {
    const dragStartHistory = dragStartHistoryRef.current;
    dragStartHistoryRef.current = null;
    setNodeDragIsActive(false);

    if (dragStartHistory === null) {
      return;
    }

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const history = commitArchitectureEditorHistoryTransaction(
        dragStartHistory,
        currentViewState.history,
      );

      return history === currentViewState.history
        ? currentViewState
        : { ...currentViewState, history };
    });
  }

  function handleBoundarySelected(boundaryId: BoundaryId | null) {
    setSelectedBoundaryId(boundaryId);
    if (boundaryId !== null) {
      setSelectedCanvasComponentIds(new Set());
      setPendingPointerConnectionSource(null);
    }
  }

  function handleBoundaryDragStart(
    boundaryId: BoundaryId,
    rendererStart: DiagramPosition,
  ) {
    const current = latestViewStateRef.current;
    if (
      current.status === "loading" ||
      dragStartHistoryRef.current !== null ||
      renameSession !== null
    ) return;
    const start = captureBoundaryMovement(current.history.present, boundaryId);
    if (!start) return;
    dragStartHistoryRef.current = current.history;
    boundaryDragRef.current = { start, rendererStart };
    handleBoundarySelected(boundaryId);
    setNodeDragIsActive(true);
  }

  function handleBoundaryPositionChange(
    boundaryId: BoundaryId,
    rendererPosition: DiagramPosition,
  ) {
    const drag = boundaryDragRef.current;
    if (!drag || drag.start.boundaryId !== boundaryId) return;
    const delta = {
      x: rendererPosition.x - drag.rendererStart.x,
      y: rendererPosition.y - drag.rendererStart.y,
    };
    setViewState((current) => {
      if (current.status === "loading") return current;
      const next = translateBoundaryMembers(current.history.present, drag.start, delta);
      const history = replaceArchitectureEditorStateWithoutHistory(current.history, next);
      return history === current.history ? current : { ...current, history };
    });
  }

  function handleBoundaryDragStop(boundaryId: BoundaryId) {
    if (boundaryDragRef.current?.start.boundaryId !== boundaryId) return;
    boundaryDragRef.current = null;
    handleNodeDragStop();
  }

  function handleBoundaryKeyboardMove(boundaryId: BoundaryId, delta: DiagramPosition) {
    if (renameSession !== null || dragStartHistoryRef.current !== null) return;
    handleBoundarySelected(boundaryId);
    setViewState((current) => {
      if (current.status === "loading") return current;
      const next = moveBoundaryBy(current.history.present, boundaryId, delta);
      const history = recordArchitectureEditorState(current.history, next);
      return history === current.history ? current : { ...current, history };
    });
  }

  function handleBoundaryDelete(boundaryId: BoundaryId) {
    if (
      activeSelectedBoundaryId !== boundaryId ||
      !canDeleteSelectedCanvasComponents(
        renameSession !== null,
        dragStartHistoryRef.current !== null,
        isEditableKeyboardTarget(document.activeElement),
      )
    ) return;
    setViewState((current) => {
      if (current.status === "loading") return current;
      const result = removeBoundaryFromEditorState(current.history.present, boundaryId);
      if (!result.ok) return current;
      const history = recordArchitectureEditorState(current.history, result.state);
      return history === current.history ? current : { ...current, history };
    });
    setSelectedBoundaryId(null);
  }

  function handleAddComponent(kind: ArchitectureComponentKind) {
    if (boundaryDragRef.current !== null) return;
    const componentId = createComponentId();

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = recordGeneratedComponentCreation(
        currentViewState.history,
        componentId,
        kind,
      );

      return result.ok
        ? {
            ...currentViewState,
            history: result.history,
            announcement: `${result.component.name} added.`,
            componentCreationRejection: null,
          }
        : {
            ...currentViewState,
            componentCreationRejection: result.error,
          };
    });
  }

  function handleAutoLayout() {
    if (boundaryDragRef.current !== null) return;
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = recordAutoLayoutFromEditorAction(
        currentViewState.history,
      );

      return result.ok
        ? {
            ...currentViewState,
            history: result.history,
            announcement: getAutoLayoutAnnouncement(result.changed),
            fitViewRequestId: getNextAutoLayoutFitRequestId(
              currentViewState.fitViewRequestId ?? 0,
              result.changed,
            ),
            autoLayoutFailure: false,
          }
        : {
            ...currentViewState,
            autoLayoutFailure: true,
          };
    });
  }

  function handleApplyArchitectureProposal() {
    if (generationReview.status !== "review" || renameSession !== null ||
        nodeDragIsActive || dragStartHistoryRef.current !== null) return;
    const currentViewState = latestViewStateRef.current;
    if (currentViewState.status === "loading") return;
    const result = applyArchitectureProposal(currentViewState.history, generationReview.proposal, {
      createComponentId,
      createConnectionId,
    });
    if (!result.ok) {
      generationControllerRef.current?.applyFailed();
      return;
    }
    setViewState((state) => state.status === "loading" ? state : {
      ...state,
      history: result.history,
      connectionRejection: null,
      componentCreationRejection: null,
      autoLayoutFailure: false,
      fitViewRequestId: (state.fitViewRequestId ?? 0) + 1,
      announcement: "Generated diagram applied. Undo is available.",
    });
    setSelectedCanvasComponentIds(new Set());
    setSelectedBoundaryId(null);
    setPendingPointerConnectionSource(null);
    setCanvasNodeFocusRequest(null);
    generationControllerRef.current?.applied();
    setDockView(null);
    generationToggleRef.current?.focus();
  }

  function handleDeleteComponent(componentId: ComponentId) {
    if (boundaryDragRef.current !== null) return;
    setSelectedCanvasComponentIds((currentSelection) => {
      if (!currentSelection.has(componentId)) return currentSelection;
      const nextSelection = new Set(currentSelection);
      nextSelection.delete(componentId);
      return nextSelection;
    });
    setPendingPointerConnectionSource((pendingSource) =>
      clearDeletedPointerConnectionSource(pendingSource, componentId),
    );

    if (renameDraft?.componentId === componentId) {
      closeRename(null);
    }

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = removeComponentFromEditorState(
        currentViewState.history.present,
        componentId,
      );

      return result.ok
        ? {
            ...currentViewState,
            history: recordArchitectureEditorState(
              currentViewState.history,
              result.state,
            ),
          }
        : currentViewState;
    });
  }

  function handleDeleteSelectedComponents(componentIds: readonly ComponentId[]) {
    if (boundaryDragRef.current !== null) return;
    setSelectedCanvasComponentIds(new Set());
    setPendingPointerConnectionSource((pendingSource) =>
      pendingSource !== null && componentIds.includes(pendingSource.componentId)
        ? null
        : pendingSource,
    );
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") return currentViewState;
      const history = recordSelectedComponentDeletion(
        currentViewState.history,
        componentIds,
      );
      return history === currentViewState.history
        ? currentViewState
        : { ...currentViewState, history };
    });
  }

  function handleComponentKindChange(
    componentId: ComponentId,
    kind: ArchitectureComponentKind,
  ) {
    if (boundaryDragRef.current !== null) return;
    // A select change is the user's current action, so it must retain focus rather
    // than restoring focus to an abandoned rename control.
    closeRename(null, "preserve-current");

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const history = recordComponentKindChangeFromList(
        currentViewState.history,
        componentId,
        kind,
      );

      return history === currentViewState.history
        ? currentViewState
        : { ...currentViewState, history };
    });
  }

  function submitRename() {
    if (boundaryDragRef.current !== null) return;
    if (renameDraft === null) {
      return;
    }

    const name = renameDraft.name.trim();

    if (!name) {
      setRenameSession((currentSession) =>
        currentSession === null
          ? currentSession
          : {
              ...currentSession,
              draft: {
                ...currentSession.draft,
                validationMessage: "Enter a component name.",
              },
            },
      );
      return;
    }

    const initialResult = renameComponentInEditorState(
      editorState,
      renameDraft.componentId,
      name,
    );

    if (!initialResult.ok) {
      if (initialResult.error.type === "component-id-does-not-exist") {
        closeRename(null);
      } else {
        setRenameSession((currentSession) =>
          currentSession === null
            ? currentSession
            : {
                ...currentSession,
                draft: {
                  ...currentSession.draft,
                  validationMessage: "Enter a component name.",
                },
              },
        );
      }
      return;
    }

    const componentId = renameDraft.componentId;
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const latestResult = renameComponentInEditorState(
        currentViewState.history.present,
        componentId,
        name,
      );

      return latestResult.ok
        ? {
            ...currentViewState,
            history: recordArchitectureEditorState(
              currentViewState.history,
              latestResult.state,
            ),
          }
        : currentViewState;
    });
    closeRename(componentId);
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitRename();
  }

  function startRename(
    component: Readonly<{ id: ComponentId; name: string }>,
    origin: RenameOrigin,
  ) {
    if (boundaryDragRef.current !== null) return;
    setPendingPointerConnectionSource(null);
    setRenameSession(createRenameSession(component.id, component.name, origin));
  }

  function handleRenameDraftChange(componentId: ComponentId, name: string) {
    setRenameSession((currentSession) => {
      if (currentSession?.draft.componentId !== componentId) {
        return currentSession;
      }

      return {
        ...currentSession,
        draft: updateRenameDraftName(currentSession.draft, name),
      };
    });
  }

  function handleNodeRenameRequested(componentId: ComponentId) {
    const component = editorState.graph
      .getComponents()
      .find((existingComponent) => existingComponent.id === componentId);

    if (component) {
      startRename(component, "canvas");
    }
  }

  const canvasRename: CanvasRenamePresentation | null =
    renameSession?.origin === "canvas" && renameDraft !== null
      ? {
          componentId: renameDraft.componentId,
          name: renameDraft.name,
          validationMessage: getRenameDraftValidationMessage(renameDraft),
          onNameChange: (name) =>
            handleRenameDraftChange(renameDraft.componentId, name),
          onSubmit: submitRename,
          onCancel: () => closeRename(renameDraft.componentId),
        }
      : null;

  function handleDeleteConnection(connectionId: ConnectionId) {
    if (boundaryDragRef.current !== null) return;
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = removeConnectionFromEditorState(
        currentViewState.history.present,
        connectionId,
      );

      return result.ok
        ? {
            ...currentViewState,
            history: recordArchitectureEditorState(
              currentViewState.history,
              result.state,
            ),
            connectionRejection: null,
          }
        : currentViewState;
    });
  }

  function handleConnectionKindChange(
    connectionId: ConnectionId,
    kind: ArchitectureConnectionKind,
  ) {
    if (boundaryDragRef.current !== null) return;
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const history = recordConnectionKindChangeFromList(
        currentViewState.history,
        connectionId,
        kind,
      );

      return history === currentViewState.history
        ? currentViewState
        : { ...currentViewState, history };
    });
  }

  function submitConnection(
    architectureConnection: ArchitectureConnection,
    announceSuccess: boolean,
  ) {
    if (boundaryDragRef.current !== null) return;
    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = addConnectionToEditorState(
        currentViewState.history.present,
        architectureConnection,
      );

      if (!result.ok) {
        return {
          ...currentViewState,
          connectionRejection: result.error,
        };
      }

      const components = currentViewState.history.present.graph.getComponents();
      const sourceName = components.find(
        (component) => component.id === architectureConnection.sourceComponentId,
      )?.name;
      const targetName = components.find(
        (component) => component.id === architectureConnection.targetComponentId,
      )?.name;

      return {
        ...currentViewState,
        history: recordArchitectureEditorState(
          currentViewState.history,
          result.state,
        ),
        connectionRejection: null,
        announcement:
          announceSuccess && sourceName && targetName
            ? getPointerConnectionSuccessAnnouncement(sourceName, targetName)
            : currentViewState.announcement,
      };
    });
  }

  function handleConnect(connection: Connection) {
    if (boundaryDragRef.current !== null) return;
    setPendingPointerConnectionSource(null);
    submitConnection(
      toArchitectureConnection(connection, createConnectionId()),
      false,
    );
  }

  function handlePointerAnchorActivated(
    componentId: ComponentId,
    side: DiagramAnchorSide,
  ) {
    const activation = activatePointerConnectionAnchor(
      pendingPointerConnectionSource,
      componentId,
      side,
    );

    setPendingPointerConnectionSource(activation.pendingSource);

    if (activation.connectionIntent !== null) {
      submitConnection(
        toArchitectureConnectionFromIntent(
          activation.connectionIntent,
          createConnectionId(),
        ),
        true,
      );
    } else {
      setViewState((currentViewState) =>
        currentViewState.status !== "loading" &&
        currentViewState.connectionRejection !== null
          ? { ...currentViewState, connectionRejection: null }
          : currentViewState,
      );
    }
  }

  function handleRetrySave() {
    if (viewState.status !== "ready") {
      return;
    }

    persistEditorState(viewState.history.present);
  }

  function handleResetSavedWorkspace() {
    if (viewState.status !== "recovery-required") {
      return;
    }

    const shouldReset = window.confirm(
      "Reset saved workspace? Saved data will be permanently deleted, and edits made during recovery will be discarded.",
    );

    if (!shouldReset) {
      return;
    }

    const storage = storageRef.current;
    const clearResult = storage
      ? clearLocalArchitectureEditorState(storage)
      : {
          ok: false,
          error: { type: "storage-unavailable" as const },
        };

    if (!clearResult.ok) {
      setViewState((currentViewState) =>
        currentViewState.status === "recovery-required"
          ? {
              ...currentViewState,
              resetFailure: clearResult.error,
            }
          : currentViewState,
      );
      return;
    }

    const freshHistory = createArchitectureEditorHistory(
      createEmptyArchitectureEditorState(),
    );
    const editorState = freshHistory.present;
    const saveResult: SaveLocalArchitectureEditorStateResult = storage
      ? saveLocalArchitectureEditorState(storage, editorState)
      : { ok: false, error: { type: "storage-unavailable" } };
    autosaveBaselineRef.current = saveResult.ok
      ? persistedEditorStateBaseline(editorState)
      : null;
    latestEditorStateRef.current = editorState;
    closeRename(null);
    setPendingPointerConnectionSource(null);
    setSelectedCanvasComponentIds(new Set());
    setSelectedBoundaryId(null);
    setViewState({
      status: "ready",
      history: freshHistory,
      connectionRejection: null,
      saveFailure: saveResult.ok ? null : saveResult.error,
    });
  }

  const components = editorState.graph.getComponents();
  const connections = editorState.graph.getConnections();
  const boundaries = editorState.graph.getBoundaries();
  const boundaryEditDisabled = !canEditBoundaries(nodeDragIsActive, renameSession !== null, pendingPointerConnectionSource !== null);
  const detailsBoundary = detailsBoundaryId === null ? undefined : editorState.graph.getBoundaryById(detailsBoundaryId);
  const pendingSourceName = pendingPointerConnectionSource === null
    ? null
    : components.find(
        (component) => component.id === pendingPointerConnectionSource.componentId,
      )?.name ?? null;
  const componentNameCounts = new Map<string, number>();
  for (const component of components) {
    componentNameCounts.set(
      component.name,
      (componentNameCounts.get(component.name) ?? 0) + 1,
    );
  }
  const componentNamesById = new Map(
    components.map((component) => [component.id, component.name]),
  );
  const connectionRows = connections.map((connection) => ({
    connection,
    sourceName: componentNamesById.get(connection.sourceComponentId)!,
    targetName: componentNamesById.get(connection.targetComponentId)!,
  }));
  const connectionRowsWithAmbiguity = connectionRows.map((row) => ({
    ...row,
    isAmbiguous: connectionRows.some(
      (otherRow) =>
        otherRow.connection.id !== row.connection.id &&
        otherRow.sourceName === row.sourceName &&
        otherRow.targetName === row.targetName,
    ),
  }));
  const recoveryDescription =
    viewState.status === "recovery-required"
      ? viewState.reason === "unsupported-schema-version"
        ? "Saved workspace uses an unsupported version. The example workspace is open, but changes are not saved."
        : "Saved workspace data is invalid or corrupt. The example workspace is open, but changes are not saved."
      : null;
  const memoryOnlyNotice =
    viewState.status === "memory-only"
      ? "Storage is unavailable. The example workspace is open, but changes will be lost on refresh."
      : null;

  function openDock(view: Exclude<UtilityDockView, null>) {
    setCreationLibraryIsOpen(false);
    if (dockView === view) {
      setDockView(null);
      return;
    }
    setDockView(view);
    window.requestAnimationFrame(() => dockCloseRef.current?.focus());
  }

  function openBoundaryCreation() {
    if (boundaryEditDisabled || boundaryDragRef.current !== null) return;
    setBoundaryCreationPrefill(getEligibleBoundaryCreationMembers(editorState.graph, selectedCanvasComponentIds));
    setBoundaryCreationSession((session) => session + 1);
    setCreationLibraryIsOpen(false);
    setDockView("boundary-create");
    window.requestAnimationFrame(() => dockCloseRef.current?.focus());
  }

  function focusBoundaryCreationTrigger() {
    if (window.matchMedia("(max-width: 1023px)").matches) creationToggleRef.current?.focus();
    else boundaryCreateTriggerRef.current?.focus();
  }

  function openBoundaryDetails(boundaryId: BoundaryId) {
    if (boundaryEditDisabled || boundaryDragRef.current !== null) return;
    setDetailsBoundaryId(boundaryId);
    handleBoundarySelected(boundaryId);
    setDockView("boundary-details");
    window.requestAnimationFrame(() => dockCloseRef.current?.focus());
  }

  function applyBoundaryEdit(result: BoundaryEditResult, announcement: string): BoundaryEditResult {
    if (result.ok) {
      const previousHistory = latestViewStateRef.current.status === "loading" ? null : latestViewStateRef.current.history;
      setViewState((current) => current.status === "loading" || current.history !== previousHistory
        ? current
        : result.changed ? { ...current, history: result.history, announcement } : current);
    }
    return result;
  }

  function withCurrentBoundaryHistory(action: (history: ArchitectureEditorHistory) => BoundaryEditResult, announcement: string): BoundaryEditResult {
    const current = latestViewStateRef.current;
    if (current.status === "loading" || boundaryEditDisabled || boundaryDragRef.current !== null) {
      return { ok: false, message: "Finish the current canvas action before editing boundaries." };
    }
    return applyBoundaryEdit(action(current.history), announcement);
  }

  function closeDock() {
    const closingView = dockView;
    setDockView(null);
    if (closingView === "boundary-create") focusBoundaryCreationTrigger();
    else (closingView === "ai" ? generationToggleRef : closingView === "analysis" ? analysisToggleRef : structureToggleRef).current?.focus();
  }

  return (
    <div className="workbench-shell">
      <header className="workbench-command-bar">
        <h1 className="workbench-identity">Architekt</h1>
        <div className="workbench-command-actions" role="group" aria-label="Workspace actions">
          <button
            aria-expanded={creationLibraryIsOpen}
            className="workbench-command workbench-mobile-create"
            onClick={() => {
              setDockView(null);
              setCreationLibraryIsOpen((open) => !open);
              window.requestAnimationFrame(() => creationCloseRef.current?.focus());
            }}
            ref={creationToggleRef}
            type="button"
          >
            <LayoutGrid aria-hidden="true" className="size-4" />
            <span>Add</span>
          </button>
          <div aria-label="History controls" className="workbench-history" role="group">
            <button aria-label="Undo" className="workbench-command" disabled={!undoIsAvailable} onClick={() => navigateHistory("undo")} type="button">
              <Undo2 aria-hidden="true" className="size-4" /><span>Undo</span>
            </button>
            <button aria-label="Redo" className="workbench-command" disabled={!redoIsAvailable} onClick={() => navigateHistory("redo")} type="button">
              <Redo2 aria-hidden="true" className="size-4" /><span>Redo</span>
            </button>
          </div>
          <AutoLayoutButton disabled={!autoLayoutIsAvailable} onAutoLayout={handleAutoLayout} />
          <button aria-label="Fit view" className="workbench-command" disabled={components.length === 0} onClick={() => setViewState((state) => state.status === "loading" ? state : { ...state, fitViewRequestId: (state.fitViewRequestId ?? 0) + 1 })} type="button">
            <Maximize2 aria-hidden="true" className="size-4" /><span>Fit view</span>
          </button>
          <button aria-expanded={dockView === "structure"} aria-controls={dockView === "structure" ? "workbench-utility-dock" : undefined} aria-pressed={dockView === "structure"} className="workbench-command" onClick={() => openDock("structure")} ref={structureToggleRef} type="button">
            <ListTree aria-hidden="true" className="size-4" /><span>Structure</span>
          </button>
          <button aria-expanded={dockView === "analysis"} aria-controls={dockView === "analysis" ? "workbench-utility-dock" : undefined} aria-pressed={dockView === "analysis"} className="workbench-command" onClick={() => openDock("analysis")} ref={analysisToggleRef} type="button">
            <ChartNoAxesCombined aria-hidden="true" className="size-4" /><span>Analysis</span>
          </button>
          <button aria-expanded={dockView === "ai"} aria-controls={dockView === "ai" ? "workbench-utility-dock" : undefined} aria-pressed={dockView === "ai"} className="workbench-command workbench-command--generate" onClick={() => openDock("ai")} ref={generationToggleRef} type="button">
            <Sparkles aria-hidden="true" className="size-4" /><span>Generate architecture</span>
          </button>
        </div>
      </header>
      <div className="workbench-notices">
        {viewState.status === "ready" && viewState.saveFailure !== null ? (
          <div
            className="flex items-center justify-between gap-3"
            role="alert"
          >
            <p className="text-sm text-danger">Changes are not saved.</p>
            <button
              className="h-9 shrink-0 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={handleRetrySave}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : viewState.status === "recovery-required" ? (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-danger">{recoveryDescription}</p>
              <button
                className="h-9 shrink-0 rounded-md border border-danger bg-surface px-3 text-xs font-semibold text-danger transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={handleResetSavedWorkspace}
                type="button"
              >
                Reset saved workspace
              </button>
            </div>
            {viewState.resetFailure !== null ? (
              <p className="mt-2 text-sm text-danger" role="alert">
                Could not clear saved workspace. Try again.
              </p>
            ) : null}
          </div>
        ) : memoryOnlyNotice ? (
          <p
            className="text-sm text-text-secondary"
            role="status"
          >
            {memoryOnlyNotice}
          </p>
        ) : null}

        {viewState.componentCreationRejection ? (
          <p className="text-sm text-danger" role="alert">
            Could not create component. Try again.
          </p>
        ) : null}

        {viewState.autoLayoutFailure ? (
          <p className="text-sm text-danger" role="alert">
            {AUTO_LAYOUT_FAILURE_MESSAGE}
          </p>
        ) : null}

        {connectionRejection ? (
          <p className="text-sm text-danger" role="alert">
            {getAddConnectionErrorMessage(connectionRejection)}
          </p>
        ) : null}

        {pendingSourceName !== null ? (
          <p className="text-sm text-text-secondary" role="status">
            {getPendingPointerConnectionStatus(pendingSourceName)}
          </p>
        ) : null}

        <p aria-live="polite" className="sr-only" role="status">{viewState.announcement ?? ""}</p>
        <p aria-live="polite" className="sr-only" role="status">
          {dockView !== "ai" && generationReview.status === "review"
            ? "Architecture draft ready. Review it before applying."
            : ""}
        </p>
      </div>

      <div className="workbench-body">
        <aside aria-label="Creation library" className={`workbench-library ${creationLibraryIsOpen ? "is-open" : ""}`}>
          <div className="workbench-pane-heading">
            <h2>Components</h2>
            <button aria-label="Close creation library" className="workbench-pane-close workbench-mobile-close" onClick={() => { setCreationLibraryIsOpen(false); creationToggleRef.current?.focus(); }} ref={creationCloseRef} type="button"><X aria-hidden="true" className="size-4" /></button>
          </div>
          <ComponentTypePicker onAddComponent={(kind) => {
            handleAddComponent(kind);
            if (creationLibraryIsOpen) {
              setCreationLibraryIsOpen(false);
              creationToggleRef.current?.focus();
            }
          }} />
          <div className="boundary-create-entry mt-3 border-t border-border pt-2">
            <button aria-label="Create boundary" className="flex min-h-10 w-full min-w-0 items-center gap-3 rounded-sm px-2.5 text-left text-sm text-text-primary hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50" disabled={boundaryEditDisabled} onClick={openBoundaryCreation} ref={boundaryCreateTriggerRef} type="button">
              <PanelsTopLeft aria-hidden="true" className="size-4 shrink-0" /><span>Boundary</span>
            </button>
          </div>
        </aside>

        {dockView !== null ? (
          <aside aria-label={`${dockView === "ai" ? "AI" : dockView === "analysis" ? "Analysis" : dockView.startsWith("boundary-") ? "Boundary" : "Structure"} utility panel`} className="workbench-dock" id="workbench-utility-dock">
            <div className="workbench-pane-heading">
              <h2>{dockView === "ai" ? "Generate architecture" : dockView === "analysis" ? "Analysis" : dockView === "boundary-create" ? "Create boundary" : dockView === "boundary-details" ? "Boundary details" : "Structure"}</h2>
              <button aria-label="Close utility panel" className="workbench-pane-close" onClick={closeDock} ref={dockCloseRef} type="button"><PanelRightClose aria-hidden="true" className="size-4" /></button>
            </div>
            <div className="workbench-dock-content">
              {dockView === "ai" ? (
                <ArchitectureGenerationPanel
                  review={generationReview}
                  applyDisabled={renameSession !== null || nodeDragIsActive}
                  onPromptChange={(prompt) => generationControllerRef.current?.setPrompt(prompt)}
                  onGenerate={() => { void generationControllerRef.current?.generate(); }}
                  onCancel={() => { generationControllerRef.current?.cancel(); generationToggleRef.current?.focus(); }}
                  onApply={handleApplyArchitectureProposal}
                  onDiscard={() => { generationControllerRef.current?.discard(); generationToggleRef.current?.focus(); }}
                />
              ) : null}
              {dockView === "analysis" ? <ArchitectureAnalysisPanel graph={editorState.graph} /> : null}
              {dockView === "boundary-create" ? <BoundaryCreationForm disabled={boundaryEditDisabled} graph={editorState.graph} initialMemberIds={boundaryCreationPrefill} key={boundaryCreationSession} onCancel={closeDock} onCreate={(name, memberIds) => {
                const id = createBoundaryId();
                const result = withCurrentBoundaryHistory(
                  (currentHistory) => recordBoundaryCreation(currentHistory, { id, name, memberComponentIds: memberIds }),
                  `Boundary ${name.trim()} created. Undo is available.`,
                );
                if (result.ok) {
                  setDetailsBoundaryId(id);
                  setSelectedBoundaryId(id);
                  setSelectedCanvasComponentIds(new Set());
                  setDockView("boundary-details");
                  window.requestAnimationFrame(() => dockCloseRef.current?.focus());
                }
                return result;
              }} /> : null}
              {dockView === "boundary-details" ? detailsBoundary ? <BoundaryDetails boundary={detailsBoundary} disabled={boundaryEditDisabled} graph={editorState.graph} key={detailsBoundary.id} onBack={() => { setDockView("structure"); window.requestAnimationFrame(() => dockCloseRef.current?.focus()); }} onDelete={() => {
                const result = withCurrentBoundaryHistory((currentHistory) => recordBoundaryDeletion(currentHistory, detailsBoundary.id), `Boundary ${detailsBoundary.name} deleted. Components and connections remain. Undo is available.`);
                if (result.ok) { setSelectedBoundaryId(null); setDockView("structure"); window.requestAnimationFrame(() => dockCloseRef.current?.focus()); }
                return result;
              }} onRename={(name) => withCurrentBoundaryHistory((currentHistory) => recordBoundaryRename(currentHistory, detailsBoundary.id, name), `Boundary renamed to ${name.trim()}. Undo is available.`)} onAssign={(componentId) => withCurrentBoundaryHistory((currentHistory) => recordBoundaryMembershipChange(currentHistory, componentId, detailsBoundary.id), "Component added to boundary. Undo is available.")} onRemove={(componentId) => withCurrentBoundaryHistory((currentHistory) => recordBoundaryMembershipChange(currentHistory, componentId, null), "Component removed from boundary. Undo is available.")} /> : <div><p className="text-sm text-text-secondary">This boundary no longer exists.</p><button className="mt-2 text-sm text-accent-ink underline" onClick={() => setDockView("structure")} type="button">Back to Structure</button></div> : null}
              {dockView === "structure" ? (
        <div className="space-y-6">
          {boundaries.length > 0 ? (
            <section>
              <h3 className="workbench-section-label">Boundaries</h3>
              <ul aria-label="Boundaries" className="mt-1 divide-y divide-border/60">
                {boundaries.map((boundary) => (
                  <li className="min-w-0 py-1 text-sm" key={boundary.id}>
                    <button aria-label={`Open boundary ${getBoundaryDisplayName(boundary, boundaries)} (${boundary.memberComponentIds.length} ${boundary.memberComponentIds.length === 1 ? "member" : "members"})`} aria-current={activeSelectedBoundaryId === boundary.id ? "true" : undefined} className="flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-sm px-1 text-left hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50" disabled={boundaryEditDisabled} onClick={() => openBoundaryDetails(boundary.id)} type="button">
                      <span className="min-w-0 truncate text-text-primary" title={getBoundaryDisplayName(boundary, boundaries)}>{boundary.name}{boundaries.some((other) => other.id !== boundary.id && other.name === boundary.name) ? <span className="block truncate font-mono text-xs text-text-muted">{boundary.id}</span> : null}</span>
                      <span className="shrink-0 text-xs text-text-secondary">{boundary.memberComponentIds.length} {boundary.memberComponentIds.length === 1 ? "member" : "members"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div>
            <h3 className="workbench-section-label">
              Components
            </h3>
            {components.length > 0 ? (
              <ul
                aria-label="Components"
                className="mt-1 divide-y divide-border/60"
              >
                {components.map((component) => (
                  <li
                    className="flex min-w-0 flex-wrap items-center gap-1 py-2"
                    key={component.id}
                  >
                    {renameSession?.origin === "list" &&
                    renameDraft?.componentId === component.id ? (
                      <div className="flex min-w-0 basis-full flex-col justify-center py-1">
                        <form
                          className="flex min-w-0 items-center gap-1"
                          onSubmit={handleRenameSubmit}
                        >
                          <label
                            className="sr-only"
                            htmlFor={`rename-component-${component.id}`}
                          >
                            Rename {component.name}
                          </label>
                          <input
                            aria-describedby={
                              getRenameDraftValidationMessage(renameDraft)
                                ? `rename-component-error-${component.id}`
                                : undefined
                            }
                            aria-invalid={
                              getRenameDraftValidationMessage(renameDraft)
                                ? true
                                : undefined
                            }
                            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-text-primary outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
                            id={`rename-component-${component.id}`}
                            onChange={(event) =>
                              handleRenameDraftChange(
                                component.id,
                                event.target.value,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                closeRename(component.id);
                              }
                            }}
                            ref={renameInputRef}
                            type="text"
                            value={renameDraft.name}
                          />
                          <button
                            className="h-8 rounded-md bg-accent px-2 text-xs font-semibold text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted disabled:hover:bg-surface-subtle"
                            disabled={renameDraft.name.trim().length === 0}
                            type="submit"
                          >
                            Save
                          </button>
                          <button
                            className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            onClick={() => closeRename(component.id)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </form>
                        {getRenameDraftValidationMessage(renameDraft) ? (
                          <p
                            className="mt-1 text-sm text-danger"
                            id={`rename-component-error-${component.id}`}
                            role="alert"
                          >
                            {getRenameDraftValidationMessage(renameDraft)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        aria-label={`Rename ${component.name}`}
                        className="min-w-0 basis-full truncate rounded-sm px-1 py-1 text-left text-sm font-medium text-text-primary transition-colors hover:bg-chrome-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        onClick={() => startRename(component, "list")}
                        ref={(element) => {
                          if (element) {
                            nameControlRefs.current.set(component.id, element);
                          } else {
                            nameControlRefs.current.delete(component.id);
                          }
                        }}
                        type="button"
                      >
                        {component.name}
                      </button>
                    )}
                    <ComponentListKindSelect
                      accessibleName={getComponentListKindSelectAccessibleName(
                        component,
                        (componentNameCounts.get(component.name) ?? 0) > 1,
                      )}
                      onKindChange={(kind) =>
                        handleComponentKindChange(component.id, kind)
                      }
                      value={component.kind}
                    />
                    <button
                      aria-label={`Delete ${component.name}`}
                      className="h-8 rounded-sm px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-chrome-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      onClick={() => handleDeleteComponent(component.id)}
                      type="button"
                    >
                      Delete
                    </button>
                    {boundaries.length > 0 ? <div className="flex min-w-0 basis-full items-center gap-2 px-1"><span className="shrink-0 text-xs text-text-secondary">Boundary</span><BoundaryMembershipSelect boundaries={boundaries} componentId={component.id} componentName={component.name} currentBoundaryId={editorState.graph.getBoundaryContainingComponent(component.id)?.id ?? null} disabled={boundaryEditDisabled} onChange={(boundaryId) => {
                      withCurrentBoundaryHistory((currentHistory) => recordBoundaryMembershipChange(currentHistory, component.id, boundaryId), boundaryId === null ? `${component.name} removed from boundary. Undo is available.` : `${component.name} assigned to boundary. Undo is available.`);
                    }} /></div> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">
                No components yet.
              </p>
            )}
          </div>

          <div>
            <h3 className="workbench-section-label">
              Connections
            </h3>
            {connectionRowsWithAmbiguity.length > 0 ? (
              <ul
                aria-label="Connections"
                className="mt-1 divide-y divide-border/60"
              >
                {connectionRowsWithAmbiguity.map(
                  ({
                    connection,
                    sourceName,
                    targetName,
                    isAmbiguous,
                  }) => (
                    <li
                      className="flex min-w-0 flex-wrap items-center gap-1 py-2"
                      key={connection.id}
                    >
                      <span className="flex min-w-0 basis-full flex-col justify-center px-1 py-1">
                        <span className="break-words text-sm text-text-primary">
                          {sourceName} <span aria-hidden="true">→</span>
                          <span className="sr-only"> to </span>{" "}
                          {targetName}
                        </span>
                        {isAmbiguous ? (
                          <span className="mt-0.5 break-all font-mono text-xs text-text-muted">
                            {connection.sourceComponentId}{" "}
                            <span aria-hidden="true">→</span>
                            <span className="sr-only"> to </span>{" "}
                            {connection.targetComponentId}
                          </span>
                        ) : null}
                      </span>
                      <ConnectionListKindSelect
                        accessibleName={getConnectionListKindSelectAccessibleName(
                          connection,
                          sourceName,
                          targetName,
                          isAmbiguous,
                        )}
                        onKindChange={(kind) =>
                          handleConnectionKindChange(connection.id, kind)
                        }
                        value={connection.kind}
                      />
                      <button
                        aria-label={
                          isAmbiguous
                            ? `Delete connection from ${sourceName} (${connection.sourceComponentId}) to ${targetName} (${connection.targetComponentId})`
                            : `Delete connection from ${sourceName} to ${targetName}`
                        }
                        className="h-8 rounded-sm px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-chrome-hover hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        onClick={() =>
                          handleDeleteConnection(connection.id)
                        }
                        type="button"
                      >
                        Delete
                      </button>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-muted">
                No connections yet.
              </p>
            )}
          </div>
        </div>
              ) : null}
            </div>
          </aside>
        ) : null}

      <div className="workbench-canvas">
        <StaticDiagram
          selectedComponentIds={selectedCanvasComponentIds}
          selectedBoundaryId={activeSelectedBoundaryId}
          boundaryNodes={boundaryNodes}
          onBoundarySelected={handleBoundarySelected}
          onBoundaryDelete={handleBoundaryDelete}
          onBoundaryDragStart={handleBoundaryDragStart}
          onBoundaryDragStop={handleBoundaryDragStop}
          onBoundaryPositionChange={handleBoundaryPositionChange}
          onBoundaryKeyboardMove={handleBoundaryKeyboardMove}
          onSelectedNodesDelete={handleDeleteSelectedComponents}
          canDeleteSelectedNodes={() =>
            canDeleteSelectedCanvasComponents(
              renameSession !== null,
              dragStartHistoryRef.current !== null,
              isEditableKeyboardTarget(document.activeElement),
            )
          }
          canvasNodeFocusRequest={canvasNodeFocusRequest}
          canvasRename={canvasRename}
          activeRenameComponentId={activeRenameComponentId}
          nodes={nodes}
          fitViewRequestId={viewState.fitViewRequestId ?? 0}
          edges={edges}
          onConnect={handleConnect}
          pendingPointerConnectionSource={pendingPointerConnectionSource}
          onPointerAnchorActivated={handlePointerAnchorActivated}
          onPointerConnectionCancelled={() =>
            setPendingPointerConnectionSource(null)
          }
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodeRenameRequested={handleNodeRenameRequested}
          onNodesChange={handleNodesChange}
        />
      </div>
      </div>
    </div>
  );
}
