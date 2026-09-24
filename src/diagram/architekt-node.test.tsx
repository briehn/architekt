import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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

function nodeProps(
  rename: ArchitektFlowNode["data"]["rename"],
  kind: ArchitectureComponentKind = "service",
): NodeProps<ArchitektFlowNode> {
  return {
    data: {
      componentId: "api" as ComponentId,
      name: "API",
      kind,
      rename,
      focusRequestId: null,
    },
    id: "api",
    isConnectable: true,
  } as NodeProps<ArchitektFlowNode>;
}

describe("ArchitektNode", () => {
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
      expect(markup).toContain("react-flow__handle-left");
      expect(markup).toContain("react-flow__handle-right");
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

  it("keeps the existing source and target handles", () => {
    const markup = renderToStaticMarkup(
      <ReactFlowProvider>
        <ArchitektNode {...nodeProps(null, "database")} />
      </ReactFlowProvider>,
    );

    expect(markup).toContain("react-flow__handle-left");
    expect(markup).toContain("react-flow__handle-right");
    expect(markup).toContain("target");
    expect(markup).toContain("source");
  });

  it("disables handles only while the node is being renamed", () => {
    expect(areArchitektNodeHandlesConnectable(true, false)).toBe(true);
    expect(areArchitektNodeHandlesConnectable(true, true)).toBe(false);
    expect(areArchitektNodeHandlesConnectable(false, false)).toBe(false);
  });
});
