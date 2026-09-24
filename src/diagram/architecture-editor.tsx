"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Connection, NodeChange } from "@xyflow/react";

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
import type { ComponentId, ConnectionId } from "../domain/identifiers";
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
  createFreshArchitectureEditorState,
  type ArchitectureEditorState,
  renameComponentInEditorState,
  removeComponentFromEditorState,
  removeConnectionFromEditorState,
} from "./architecture-editor-state";
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
  toReactFlowDiagram,
  withReactFlowNodeMeasurements,
} from "./react-flow-adapter";
import type { CanvasRenamePresentation } from "./architekt-node";
import { getComponentKindPresentation } from "./component-kind-presentation";
import { getConnectionKindPresentation } from "./connection-kind-presentation";
import {
  StaticDiagram,
  type CanvasNodeFocusRequest,
} from "./static-diagram";

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
  readonly autoLayoutFitRequestId?: number;
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

type PersistedEditorStateBaseline = Pick<
  ArchitectureEditorState,
  "graph" | "nodePositions"
>;

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
    <div aria-label="Add component" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]" role="group">
      {COMPONENT_CREATION_KIND_ORDER.map((kind) => {
        const presentation = getComponentKindPresentation(kind);
        const { Icon } = presentation;

        return (
          <button
            aria-label={`Add ${presentation.generatedName} component`}
            className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
      className="h-full max-w-36 border-l border-border bg-surface px-2 pr-7 text-xs text-text-primary outline-none transition-colors hover:bg-surface focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
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
      className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted disabled:hover:bg-surface-subtle"
      disabled={disabled}
      onClick={onAutoLayout}
      type="button"
    >
      Auto-layout
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
      className="h-full max-w-40 shrink-0 border-l border-border bg-surface px-2 pr-7 text-xs text-text-primary outline-none transition-colors hover:bg-surface focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
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

function persistedEditorStateBaseline(
  editorState: ArchitectureEditorState,
): PersistedEditorStateBaseline {
  return {
    graph: editorState.graph,
    nodePositions: editorState.nodePositions,
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
  const storageRef = useRef<StorageLike | null>(null);
  const autosaveBaselineRef = useRef<PersistedEditorStateBaseline | null>(null);
  const latestEditorStateRef = useRef<ArchitectureEditorState | null>(null);
  const dragStartHistoryRef = useRef<ArchitectureEditorHistory | null>(null);
  const latestViewStateRef = useRef<ArchitectureEditorViewState>(viewState);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const nameControlRefs = useRef(
    new Map<ComponentId, HTMLButtonElement>(),
  );
  const nameControlToFocusRef = useRef<ComponentId | null>(null);

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

  useEffect(() => {
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
  }, [navigateHistory]);

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
            editorStateToSave.nodePositions;

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

  const autosaveGraph =
    viewState.status === "ready" ? viewState.history.present.graph : null;
  const autosaveNodePositions =
    viewState.status === "ready"
      ? viewState.history.present.nodePositions
      : null;

  useEffect(() => {
    if (autosaveGraph === null || autosaveNodePositions === null) {
      return;
    }

    const baseline = autosaveBaselineRef.current;
    if (
      baseline?.graph === autosaveGraph &&
      baseline.nodePositions === autosaveNodePositions
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
        (latestBaseline?.graph === autosaveGraph &&
          latestBaseline.nodePositions === autosaveNodePositions)
      ) {
        return;
      }

      persistEditorState(latestEditorState);
    }, AUTOSAVE_DELAY_MILLISECONDS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autosaveGraph, autosaveNodePositions, persistEditorState]);

  if (viewState.status === "loading") {
    return (
      <div
        className="flex h-full min-h-0 w-full items-center justify-center bg-surface px-4"
        role="status"
      >
        <p className="text-sm text-text-muted">
          Loading saved workspace…
        </p>
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

  function handleNodesChange(changes: NodeChange[]) {
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

  function handleAddComponent(kind: ArchitectureComponentKind) {
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
            autoLayoutFitRequestId: getNextAutoLayoutFitRequestId(
              currentViewState.autoLayoutFitRequestId ?? 0,
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

  function handleDeleteComponent(componentId: ComponentId) {
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

  function handleComponentKindChange(
    componentId: ComponentId,
    kind: ArchitectureComponentKind,
  ) {
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

  function handleConnect(connection: Connection) {
    const architectureConnection = toArchitectureConnection(
      connection,
      createConnectionId(),
    );

    setViewState((currentViewState) => {
      if (currentViewState.status === "loading") {
        return currentViewState;
      }

      const result = addConnectionToEditorState(
        currentViewState.history.present,
        architectureConnection,
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
        : {
            ...currentViewState,
            connectionRejection: result.error,
          };
    });
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

    const freshHistory = createFreshExampleArchitectureEditorHistory();
    const editorState = freshHistory.present;
    autosaveBaselineRef.current = persistedEditorStateBaseline(editorState);
    latestEditorStateRef.current = editorState;
    closeRename(null);
    setViewState({
      status: "ready",
      history: freshHistory,
      connectionRejection: null,
      saveFailure: null,
    });
  }

  const components = editorState.graph.getComponents();
  const connections = editorState.graph.getConnections();
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

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-3 sm:px-4">
        {viewState.status === "ready" && viewState.saveFailure !== null ? (
          <div
            className="mb-3 flex items-center justify-between gap-3"
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
          <div className="mb-3">
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
            className="mb-3 text-sm text-text-secondary"
            role="status"
          >
            {memoryOnlyNotice}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-text-secondary">
              Add component
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <AutoLayoutButton
                disabled={!autoLayoutIsAvailable}
                onAutoLayout={handleAutoLayout}
              />
              <div
                aria-label="History controls"
                className="flex gap-2 border-l border-border pl-2"
                role="group"
              >
                <button
                  className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted disabled:hover:bg-surface-subtle"
                  disabled={!undoIsAvailable}
                  onClick={() => navigateHistory("undo")}
                  type="button"
                >
                  Undo
                </button>
                <button
                  className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted disabled:hover:bg-surface-subtle"
                  disabled={!redoIsAvailable}
                  onClick={() => navigateHistory("redo")}
                  type="button"
                >
                  Redo
                </button>
              </div>
            </div>
          </div>
          <ComponentTypePicker onAddComponent={handleAddComponent} />
          <p aria-live="polite" className="sr-only" role="status">
            {viewState.announcement ?? ""}
          </p>
        </div>

        {viewState.componentCreationRejection ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            Could not create component. Try again.
          </p>
        ) : null}

        {viewState.autoLayoutFailure ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {AUTO_LAYOUT_FAILURE_MESSAGE}
          </p>
        ) : null}

        {connectionRejection ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {getAddConnectionErrorMessage(connectionRejection)}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 border-t border-border pt-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-text-secondary">
              Components
            </p>
            {components.length > 0 ? (
              <ul
                aria-label="Components"
                className="mt-2 flex flex-wrap gap-2"
              >
                {components.map((component) => (
                  <li
                    className="flex min-h-9 items-stretch overflow-hidden rounded-md border border-border bg-surface-subtle"
                    key={component.id}
                  >
                    {renameSession?.origin === "list" &&
                    renameDraft?.componentId === component.id ? (
                      <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-1">
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
                        className="min-w-0 px-3 text-left text-sm text-text-primary transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
                      className="h-full border-l border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      onClick={() => handleDeleteComponent(component.id)}
                      type="button"
                    >
                      Delete
                    </button>
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
            <p className="text-xs font-semibold text-text-secondary">
              Connections
            </p>
            {connectionRowsWithAmbiguity.length > 0 ? (
              <ul
                aria-label="Connections"
                className="mt-2 flex flex-wrap gap-2"
              >
                {connectionRowsWithAmbiguity.map(
                  ({
                    connection,
                    sourceName,
                    targetName,
                    isAmbiguous,
                  }) => (
                    <li
                      className="flex min-h-9 items-stretch overflow-hidden rounded-md border border-border bg-surface-subtle"
                      key={connection.id}
                    >
                      <span className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
                        <span className="text-sm text-text-primary">
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
                        className="border-l border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
      </div>

      <div className="min-h-0 flex-1">
        <StaticDiagram
          canvasNodeFocusRequest={canvasNodeFocusRequest}
          canvasRename={canvasRename}
          nodes={nodes}
          autoLayoutFitRequestId={viewState.autoLayoutFitRequestId ?? 0}
          edges={edges}
          onConnect={handleConnect}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onNodeRenameRequested={handleNodeRenameRequested}
          onNodesChange={handleNodesChange}
        />
      </div>
    </div>
  );
}
