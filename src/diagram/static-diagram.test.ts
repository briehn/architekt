import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Node } from "@xyflow/react";
import type { ComponentId } from "../domain/identifiers";
import type { ArchitectureFlowNode } from "./react-flow-adapter";
import {
  requestComponentRenameFromNode,
  StaticDiagram,
} from "./static-diagram";

describe("requestComponentRenameFromNode", () => {
  it("reports the React Flow node ID as the component ID", () => {
    const onNodeRenameRequested = vi.fn();
    const node = { id: "api" } as Pick<Node, "id">;

    requestComponentRenameFromNode(node, onNodeRenameRequested);

    expect(onNodeRenameRequested).toHaveBeenCalledWith("api" as ComponentId);
  });

  it("labels the focusable React Flow node with its name and kind", () => {
    const nodes: ArchitectureFlowNode[] = [
      {
        id: "payments-api",
        data: {
          componentId: "payments-api" as ComponentId,
          name: "Payments API",
          kind: "service",
        },
        position: { x: 40, y: 80 },
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(StaticDiagram, {
        nodes,
        edges: [],
        onConnect: vi.fn(),
        onNodeDragStart: vi.fn(),
        onNodeDragStop: vi.fn(),
        onNodesChange: vi.fn(),
        canvasRename: null,
        canvasNodeFocusRequest: null,
        onNodeRenameRequested: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Payments API, Service"');
  });
});
