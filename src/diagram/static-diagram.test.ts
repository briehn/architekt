import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Node } from "@xyflow/react";
import type { ComponentId } from "../domain/identifiers";
import type { ArchitectureConnectionKind } from "../domain/architecture-connection";
import type {
  ArchitectureFlowEdge,
  ArchitectureFlowNode,
} from "./react-flow-adapter";
import {
  requestComponentRenameFromNode,
  StaticDiagram,
  withArchitectureEdgePresentation,
} from "./static-diagram";

function node(id: string, name: string): ArchitectureFlowNode {
  return {
    id,
    data: {
      componentId: id as ComponentId,
      name,
      kind: "service",
    },
    position: { x: 0, y: 0 },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  kind: ArchitectureConnectionKind,
): ArchitectureFlowEdge {
  return {
    id,
    source,
    target,
    markerEnd: { type: "arrowclosed" },
    data: { kind },
  };
}

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

describe("withArchitectureEdgePresentation", () => {
  it("renders approved labels only for non-generic kinds and provides accessible descriptions for all kinds", () => {
    const nodes = [node("api", "API"), node("database", "Database")];
    const edges = [
      edge("generic", "api", "database", "generic"),
      edge("request-response", "api", "database", "request-response"),
      edge("async-messaging", "api", "database", "async-messaging"),
      edge("streaming", "api", "database", "streaming"),
      edge("data-access", "api", "database", "data-access"),
    ];

    const presentedEdges = withArchitectureEdgePresentation(edges, nodes);

    expect(presentedEdges.map((presentedEdge) => presentedEdge.label)).toEqual([
      undefined,
      "Request/response",
      "Async messaging",
      "Streaming",
      "Data access",
    ]);
    expect(presentedEdges.map((presentedEdge) => presentedEdge.ariaLabel)).toEqual([
      "API to Database, Generic",
      "API to Database, Request/response",
      "API to Database, Async messaging",
      "API to Database, Streaming",
      "API to Database, Data access",
    ]);
    expect(presentedEdges[0]).toMatchObject({
      id: "generic",
      source: "api",
      target: "database",
      markerEnd: { type: "arrowclosed" },
      data: { kind: "generic" },
      labelShowBg: false,
    });
    for (const presentedEdge of presentedEdges.slice(1)) {
      expect(presentedEdge).toMatchObject({
        markerEnd: { type: "arrowclosed" },
        labelShowBg: true,
        labelStyle: {
          fill: "var(--text-secondary)",
          fontSize: 12,
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: "var(--surface)",
          stroke: "var(--border)",
          strokeWidth: 1,
        },
        labelBgPadding: [2, 4],
        labelBgBorderRadius: 4,
      });
    }
    for (const presentedEdge of presentedEdges) {
      expect(presentedEdge.animated).toBeUndefined();
      expect(presentedEdge.style).toBeUndefined();
    }
  });

  it("updates only semantic presentation when the canonical kind changes", () => {
    const nodes = [node("api", "API"), node("database", "Database")];
    const originalEdges = [
      edge("api-to-database", "api", "database", "generic"),
      edge("database-to-api", "database", "api", "streaming"),
    ];
    const changedEdges = [
      { ...originalEdges[0], data: { kind: "request-response" as const } },
      originalEdges[1],
    ];

    const originalPresentation = withArchitectureEdgePresentation(
      originalEdges,
      nodes,
    );
    const changedPresentation = withArchitectureEdgePresentation(
      changedEdges,
      nodes,
    );

    expect(changedPresentation).toEqual([
      {
        ...originalPresentation[0],
        data: { kind: "request-response" },
        label: "Request/response",
        labelShowBg: true,
        labelStyle: {
          fill: "var(--text-secondary)",
          fontSize: 12,
          fontWeight: 600,
        },
        labelBgStyle: {
          fill: "var(--surface)",
          stroke: "var(--border)",
          strokeWidth: 1,
        },
        labelBgPadding: [2, 4],
        labelBgBorderRadius: 4,
        ariaLabel: "API to Database, Request/response",
      },
      originalPresentation[1],
    ]);
    expect(originalEdges).toEqual([
      edge("api-to-database", "api", "database", "generic"),
      edge("database-to-api", "database", "api", "streaming"),
    ]);
  });

  it("uses current endpoint names, conditionally disambiguates duplicates, and preserves reverse semantics", () => {
    const originalNodes = [node("api", "API"), node("database", "Database")];
    const renamedNodes = [
      node("api", "Public API"),
      node("database", "Database"),
    ];
    const reverseEdges = [
      edge("api-to-database", "api", "database", "data-access"),
      edge("database-to-api", "database", "api", "async-messaging"),
    ];

    expect(
      withArchitectureEdgePresentation(reverseEdges, originalNodes).map(
        (presentedEdge) => presentedEdge.ariaLabel,
      ),
    ).toEqual([
      "API to Database, Data access",
      "Database to API, Async messaging",
    ]);
    expect(
      withArchitectureEdgePresentation([reverseEdges[0]], renamedNodes)[0],
    ).toMatchObject({
      data: { kind: "data-access" },
      label: "Data access",
      ariaLabel: "Public API to Database, Data access",
    });
    expect(
      withArchitectureEdgePresentation(
        [edge("duplicate", "api-one", "api-two", "generic")],
        [node("api-one", "API"), node("api-two", "API")],
      )[0]?.ariaLabel,
    ).toBe("API (api-one) to API (api-two), Generic");
  });
});
