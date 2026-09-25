import {
  Handle,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import type { ComponentId } from "../domain/identifiers";
import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";
import {
  DIAGRAM_ANCHOR_HANDLES,
  DIAGRAM_ANCHOR_SIDES,
} from "./adaptive-anchor-renderer";
import {
  getArchitectureNodeAccessibleLabel,
  getComponentKindPresentation,
} from "./component-kind-presentation";
import type { ArchitectureFlowNodeData } from "./react-flow-adapter";
import {
  ANCHOR_KEYBOARD_INSTRUCTIONS_ID,
  applyAnchorKeyboardAction,
  getConnectionAnchorAccessibleName,
} from "./anchor-keyboard-interaction";

export type CanvasRenamePresentation = Readonly<{
  componentId: ComponentId;
  name: string;
  validationMessage: string | null;
  onNameChange(name: string): void;
  onSubmit(): void;
  onCancel(): void;
}>;

export type ArchitektNodeData = ArchitectureFlowNodeData & Readonly<{
  rename: CanvasRenamePresentation | null;
  focusRequestId: number | null;
  pointerConnection?: Readonly<{
    accessibleComponentName: string;
    pendingSourceAccessibleName: string | null;
    pendingSourceSide: DiagramAnchorSide | null;
    destinationAvailable: boolean;
    onAnchorPointerDown(): void;
    onAnchorClick(side: DiagramAnchorSide): void;
    onAnchorActivate(side: DiagramAnchorSide): void;
  }>;
}>;

export type ArchitektFlowNode = Node<ArchitektNodeData, "architekt">;

export function areArchitektNodeHandlesConnectable(
  isConnectable: boolean,
  isRenaming: boolean,
): boolean {
  return isConnectable && !isRenaming;
}

export function ArchitektNode({
  data,
  isConnectable,
  selected,
}: NodeProps<ArchitektFlowNode>) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anchorRefs = useRef<Record<DiagramAnchorSide, HTMLDivElement | null>>({
    top: null,
    right: null,
    bottom: null,
    left: null,
  });
  const [activeAnchorSide, setActiveAnchorSide] =
    useState<DiagramAnchorSide>("right");
  const rename = data.rename;
  const isRenaming = rename !== null;
  const kindPresentation = getComponentKindPresentation(data.kind);
  const KindIcon = kindPresentation.Icon;
  const handlesAreConnectable = areArchitektNodeHandlesConnectable(
    isConnectable,
    isRenaming,
  );
  const isPendingConnectionSource =
    data.pointerConnection?.pendingSourceSide !== null &&
    data.pointerConnection?.pendingSourceSide !== undefined;

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    if (data.focusRequestId !== null) {
      nodeRef.current?.focus();
    }
  }, [data.focusRequestId]);

  return (
    <div
      aria-label={getArchitectureNodeAccessibleLabel(data.name, data.kind)}
      className={`react-flow__node-default relative${
        selected ? " architekt-node--selected" : ""
      }${
        isPendingConnectionSource
          ? " architekt-node--connection-source"
          : ""
      }`}
      ref={nodeRef}
      role="group"
      tabIndex={-1}
    >
      {DIAGRAM_ANCHOR_SIDES.map((side) => (
        <Handle
          aria-disabled={!handlesAreConnectable}
          aria-describedby={ANCHOR_KEYBOARD_INSTRUCTIONS_ID}
          aria-label={getConnectionAnchorAccessibleName(
            data.pointerConnection?.accessibleComponentName ?? data.name,
            side,
            data.pointerConnection?.pendingSourceAccessibleName ?? null,
            isPendingConnectionSource,
          )}
          className={`architekt-anchor${
            data.pointerConnection?.pendingSourceSide === side
              ? " architekt-anchor--connection-source"
              : data.pointerConnection?.destinationAvailable
                ? " architekt-anchor--connection-destination"
                : ""
          }`}
          id={DIAGRAM_ANCHOR_HANDLES[side].id}
          isConnectable={handlesAreConnectable}
          isConnectableEnd={handlesAreConnectable}
          isConnectableStart={handlesAreConnectable}
          key={side}
          onClick={
            handlesAreConnectable
              ? () => data.pointerConnection?.onAnchorClick(side)
              : undefined
          }
          onFocus={() => setActiveAnchorSide(side)}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (!handlesAreConnectable) {
              return;
            }

            if (applyAnchorKeyboardAction(
              event.key,
              event.repeat,
              (nextSide) => {
                setActiveAnchorSide(nextSide);
                anchorRefs.current[nextSide]?.focus();
              },
              () => data.pointerConnection?.onAnchorActivate(side),
            )) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onPointerDown={data.pointerConnection?.onAnchorPointerDown}
          position={DIAGRAM_ANCHOR_HANDLES[side].position}
          ref={(element) => {
            anchorRefs.current[side] = element;
          }}
          role="button"
          tabIndex={handlesAreConnectable && activeAnchorSide === side ? 0 : -1}
          type="source"
        />
      ))}
      {rename === null ? (
        <div className="flex flex-col items-start gap-1 text-left">
          <span className="text-sm font-semibold text-text-primary">
            {data.name}
          </span>
          <span className="flex items-center gap-1.5 text-xs leading-4 text-text-muted">
            <KindIcon
              aria-hidden="true"
              className="shrink-0"
              focusable="false"
              size={16}
              strokeWidth={1.75}
            />
            <span>{kindPresentation.label}</span>
          </span>
        </div>
      ) : (
        <form
          className="nodrag nopan nowheel flex flex-col gap-1"
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            rename.onSubmit();
          }}
        >
          <label className="sr-only" htmlFor={`rename-node-${rename.componentId}`}>
            Rename component
          </label>
          <input
            aria-describedby={
              rename.validationMessage
                ? `rename-node-error-${rename.componentId}`
                : undefined
            }
            aria-invalid={rename.validationMessage ? true : undefined}
            className="nodrag nopan nowheel h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus-ring"
            id={`rename-node-${rename.componentId}`}
            onChange={(event) => rename.onNameChange(event.target.value)}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                rename.onCancel();
              }
            }}
            ref={inputRef}
            type="text"
            value={rename.name}
          />
          <div className="flex justify-end gap-1">
            <button
              className="nodrag nopan nowheel h-7 rounded-md bg-accent px-2 text-xs font-semibold text-surface transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:bg-surface-subtle disabled:text-text-muted disabled:hover:bg-surface-subtle"
              disabled={rename.name.trim().length === 0}
              type="submit"
            >
              Save
            </button>
            <button
              className="nodrag nopan nowheel h-7 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={rename.onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>
          {rename.validationMessage ? (
            <p
              className="text-sm text-danger"
              id={`rename-node-error-${rename.componentId}`}
              role="alert"
            >
              {rename.validationMessage}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
