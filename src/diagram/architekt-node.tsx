import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

import type { ComponentId } from "../domain/identifiers";

export type CanvasRenamePresentation = Readonly<{
  componentId: ComponentId;
  name: string;
  validationMessage: string | null;
  onNameChange(name: string): void;
  onSubmit(): void;
  onCancel(): void;
}>;

export type ArchitektNodeData = Readonly<{
  label: string;
  rename: CanvasRenamePresentation | null;
  focusRequestId: number | null;
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
}: NodeProps<ArchitektFlowNode>) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rename = data.rename;
  const isRenaming = rename !== null;
  const handlesAreConnectable = areArchitektNodeHandlesConnectable(
    isConnectable,
    isRenaming,
  );

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
      className="react-flow__node-default relative"
      ref={nodeRef}
      tabIndex={-1}
    >
      <Handle
        isConnectable={handlesAreConnectable}
        position={Position.Top}
        type="target"
      />
      {rename === null ? (
        data.label
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
      <Handle
        isConnectable={handlesAreConnectable}
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}
