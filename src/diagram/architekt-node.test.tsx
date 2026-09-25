import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps, MouseEvent } from "react";

import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import {
  ARCHITECTURE_COMPONENT_KINDS,
  type ArchitectureComponentKind,
} from "../domain/architecture-component";
import type { ComponentId } from "../domain/identifiers";
import {
  ArchitektNode,
  areArchitektNodeHandlesConnectable,
  type ArchitektFlowNode,
} from "./architekt-node";
import { getComponentKindPresentation } from "./component-kind-presentation";
import {
  DIAGRAM_ANCHOR_HANDLES,
  DIAGRAM_ANCHOR_SIDES,
} from "./adaptive-anchor-renderer";
import type { DiagramAnchorSide } from "./adaptive-anchor-geometry";

const renderedHandles = vi.hoisted(() => new Map<string, ComponentProps<typeof import("@xyflow/react").Handle>>());

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Handle: (props: ComponentProps<typeof actual.Handle>) => {
      renderedHandles.set(props.id!, props);
      return <actual.Handle {...props} />;
    },
  };
});

function nodeProps(
  rename: ArchitektFlowNode["data"]["rename"],
  kind: ArchitectureComponentKind = "service",
  pointerConnection?: ArchitektFlowNode["data"]["pointerConnection"],
): NodeProps<ArchitektFlowNode> {
  return {
    data: {
      componentId: "api" as ComponentId,
      name: "API",
      kind,
      rename,
      focusRequestId: null,
      pointerConnection,
    },
    id: "api",
    isConnectable: true,
  } as NodeProps<ArchitektFlowNode>;
}

describe("ArchitektNode", () => {
  it("marks only a selected node", () => {
    const unselected = renderToStaticMarkup(
      <ReactFlowProvider><ArchitektNode {...nodeProps(null)} selected={false} /></ReactFlowProvider>,
    );
    const selected = renderToStaticMarkup(
      <ReactFlowProvider><ArchitektNode {...nodeProps(null)} selected /></ReactFlowProvider>,
    );
    expect(unselected).not.toContain("architekt-node--selected");
    expect(selected).toContain("architekt-node--selected");
  });

  it.each(ARCHITECTURE_COMPONENT_KINDS)(
    "renders the approved visible label for %s",
    (kind) => {
      const markup = renderToStaticMarkup(
        <ReactFlowProvider>
          <ArchitektNode {...nodeProps(null, kind)} />
        </ReactFlowProvider>,
      );

      const { label } = getComponentKindPresentation(kind);

      expect(markup).toContain(`>${label}<`);
      expect(markup).toContain(`aria-label="API, ${label}"`);
      expect(markup.match(/data-handleid="anchor-[^"]+"/g)).toHaveLength(4);
      for (const side of DIAGRAM_ANCHOR_SIDES) {
        expect(markup).toContain(`data-handleid="${DIAGRAM_ANCHOR_HANDLES[side].id}"`);
      }
    },
  );

  it("renders the component name and read-only kind semantics", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null)} />
      </ReactFlowProvider>,
    );

    expect(markup).toContain("API");
    expect(markup).toContain("Service");
    expect(markup).toContain('aria-label="API, Service"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="16"');
    expect(markup).toContain('height="16"');
    expect(markup).toContain("text-text-primary");
    expect(markup).toContain("text-text-muted");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<button");
  });

  it("uses React Flow interaction-suppression classes for canvas rename controls", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode
          {...nodeProps({
            componentId: "api" as ComponentId,
            name: "API",
            validationMessage: null,
            onNameChange: () => {},
            onSubmit: () => {},
            onCancel: () => {},
          })}
        />
      </ReactFlowProvider>,
    );

    expect(markup).toContain("nodrag nopan nowheel");
    expect(markup).toContain("Save");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain(">Service<");
  });

  it("renders exactly four shared source handles with stable IDs and positions", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null, "database")} />
      </ReactFlowProvider>,
    );

    const handles = markup.match(/<div[^>]*data-handleid="anchor-[^"]+"[^>]*>/g) ?? [];
    expect(handles).toHaveLength(4);
    expect(handles.filter((handle) => handle.includes('tabindex="0"'))).toHaveLength(1);

    for (const side of DIAGRAM_ANCHOR_SIDES) {
      const handle = handles.find((entry) =>
        entry.includes(`data-handleid="${DIAGRAM_ANCHOR_HANDLES[side].id}"`),
      );
      expect(handle).toContain(`data-handlepos="${side}"`);
      expect(handle).toMatch(/class="[^"]*\bsource\b/);
      expect(handle).not.toMatch(/class="[^"]*\btarget\b/);
      expect(handle).toContain("connectable");
      expect(handle).toContain('role="button"');
      expect(handle).toContain('aria-describedby="architekt-anchor-keyboard-instructions"');
      expect(handle).toContain(
        `tabindex="${side === "right" ? 0 : -1}"`,
      );
      expect(handle).toContain(
        `aria-label="Start connection from API, ${side}."`,
      );
    }
  });

  it("disables handles only while the node is being renamed", () => {
    expect(areArchitektNodeHandlesConnectable(true, false)).toBe(true);
    expect(areArchitektNodeHandlesConnectable(true, true)).toBe(false);
    expect(areArchitektNodeHandlesConnectable(false, false)).toBe(false);

    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode
          {...nodeProps({
            componentId: "api" as ComponentId,
            name: "API",
            validationMessage: null,
            onNameChange: () => {},
            onSubmit: () => {},
            onCancel: () => {},
          })}
        />
      </ReactFlowProvider>,
    );
    const handles = markup.match(/<div[^>]*data-handleid="anchor-[^"]+"[^>]*>/g) ?? [];
    expect(handles).toHaveLength(4);
    for (const handle of handles) {
      expect(handle).not.toMatch(/class="[^"]*\bconnectable\b/);
      expect(handle).not.toMatch(/class="[^"]*\bconnectablestart\b/);
      expect(handle).not.toMatch(/class="[^"]*\bconnectableend\b/);
      expect(handle).toContain('tabindex="-1"');
      expect(handle).toContain('aria-disabled="true"');
    }
  });

  it("does not let anchor double-clicks start node rename", () => {
    renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null)} />
      </ReactFlowProvider>,
    );
    for (const side of DIAGRAM_ANCHOR_SIDES) {
      const stopPropagation = vi.fn();
      renderedHandles.get(DIAGRAM_ANCHOR_HANDLES[side].id)?.onDoubleClick?.({
        stopPropagation,
      } as unknown as MouseEvent<HTMLDivElement>);
      expect(stopPropagation).toHaveBeenCalledOnce();
    }
  });

  it("removes externally disabled nodes' anchors from keyboard and pointer activation", () => {
    const onAnchorActivate = vi.fn();
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null, "service", {
          accessibleComponentName: "API",
          pendingSourceAccessibleName: null,
          pendingSourceSide: null,
          destinationAvailable: false,
          onAnchorPointerDown: vi.fn(),
          onAnchorClick: vi.fn(),
          onAnchorActivate,
        })} isConnectable={false} />
      </ReactFlowProvider>,
    );
    expect(markup).not.toContain('tabindex="0"');
    for (const side of DIAGRAM_ANCHOR_SIDES) {
      const handle = renderedHandles.get(DIAGRAM_ANCHOR_HANDLES[side].id)!;
      expect(handle["aria-disabled"]).toBe(true);
      expect(handle.onClick).toBeUndefined();
      handle.onKeyDown?.({ key: "Enter" } as React.KeyboardEvent<HTMLDivElement>);
    }
    expect(onAnchorActivate).not.toHaveBeenCalled();
  });

  it("marks the pending source side and makes destination anchors more apparent", () => {
    const pointerConnection = {
      accessibleComponentName: "API",
      pendingSourceAccessibleName: "API",
      pendingSourceSide: "top" as DiagramAnchorSide,
      destinationAvailable: false,
      onAnchorPointerDown: () => {},
      onAnchorClick: () => {},
      onAnchorActivate: () => {},
    };
    const sourceMarkup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null, "service", pointerConnection)} selected />
      </ReactFlowProvider>,
    );
    const destinationMarkup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode
          {...nodeProps(null, "cache", {
            ...pointerConnection,
            pendingSourceSide: null,
            destinationAvailable: true,
          })}
        />
      </ReactFlowProvider>,
    );

    expect(sourceMarkup).toContain("architekt-node--connection-source");
    expect(sourceMarkup).toContain("architekt-node--selected");
    expect(sourceMarkup.match(/architekt-anchor--connection-source/g)).toHaveLength(1);
    expect(destinationMarkup).not.toContain("architekt-node--connection-source");
    expect(destinationMarkup.match(/architekt-anchor--connection-destination/g)).toHaveLength(4);
    expect(sourceMarkup).toContain(
      'aria-label="Change connection start for API to top."',
    );
    expect(destinationMarkup).toContain(
      'aria-label="Connect API to API, right."',
    );
  });
});
