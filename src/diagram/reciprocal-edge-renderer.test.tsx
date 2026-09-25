import { Position, type EdgeProps } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ComponentId } from "../domain/identifiers";
import { withAdaptiveEdgeAnchors } from "./adaptive-anchor-renderer";
import type { ArchitectureFlowEdge, ArchitectureFlowNode } from "./react-flow-adapter";
import {
  RECIPROCAL_EDGE_TYPE,
  ReciprocalArchitectureEdge,
  withReciprocalEdgeTypes,
} from "./reciprocal-edge-renderer";
import { withArchitectureEdgePresentation } from "./static-diagram";

function node(id: string, name: string, x: number, y: number): ArchitectureFlowNode {
  return {
    id,
    data: { componentId: id as ComponentId, name, kind: "service" },
    position: { x, y },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  kind: ArchitectureFlowEdge["data"]["kind"] = "generic",
): ArchitectureFlowEdge {
  return {
    id,
    source,
    target,
    data: { kind },
    markerEnd: { type: "arrowclosed" },
  };
}

function deriveEdges(
  edges: readonly ArchitectureFlowEdge[],
  nodes: readonly ArchitectureFlowNode[],
): ArchitectureFlowEdge[] {
  return withReciprocalEdgeTypes(
    withArchitectureEdgePresentation(withAdaptiveEdgeAnchors(edges, nodes), nodes),
  );
}

describe("reciprocal edge selection", () => {
  it("switches only a reverse pair to custom edges, then restores the built-in edge on removal", () => {
    const nodes = [node("a", "A", 0, 0), node("b", "B", 400, 0)];
    const forward = edge("a-b", "a", "b", "request-response");
    const reverse = edge("b-a", "b", "a", "async-messaging");

    const ordinary = deriveEdges([forward], nodes);
    const paired = deriveEdges([forward, reverse], nodes);
    const afterRemoval = deriveEdges([forward], nodes);

    expect(ordinary[0]?.type).toBeUndefined();
    expect(paired.map((derived) => derived.type)).toEqual([
      RECIPROCAL_EDGE_TYPE,
      RECIPROCAL_EDGE_TYPE,
    ]);
    expect(paired).toMatchObject([
      {
        id: "a-b", source: "a", target: "b",
        sourceHandle: "anchor-right", targetHandle: "anchor-left",
        markerEnd: { type: "arrowclosed" },
        label: "Request/response", ariaLabel: "A to B, Request/response",
        data: { kind: "request-response" },
      },
      {
        id: "b-a", source: "b", target: "a",
        sourceHandle: "anchor-left", targetHandle: "anchor-right",
        markerEnd: { type: "arrowclosed" },
        label: "Async messaging", ariaLabel: "B to A, Async messaging",
        data: { kind: "async-messaging" },
      },
    ]);
    expect(afterRemoval[0]).toEqual(ordinary[0]);
    expect([forward, reverse].every((canonical) => canonical.type === undefined)).toBe(true);
  });

  it("keeps unrelated triangle edges ordinary with their adaptive anchors", () => {
    const nodes = [
      node("client", "Client", 0, 0),
      node("service", "Service", 0, 250),
      node("cache", "Cache", 400, 150),
    ];
    const edges = deriveEdges([
      edge("client-service", "client", "service"),
      edge("service-cache", "service", "cache", "streaming"),
      edge("cache-service", "cache", "service"),
      edge("cache-client", "cache", "client", "data-access"),
    ], nodes);

    expect(edges).toMatchObject([
      {
        sourceHandle: "anchor-bottom", targetHandle: "anchor-top",
      },
      {
        type: RECIPROCAL_EDGE_TYPE, sourceHandle: "anchor-right", targetHandle: "anchor-left",
        label: "Streaming",
      },
      {
        type: RECIPROCAL_EDGE_TYPE, sourceHandle: "anchor-left", targetHandle: "anchor-right",
        label: undefined, ariaLabel: "Cache to Service, Generic",
      },
      {
        sourceHandle: "anchor-left", targetHandle: "anchor-right",
        label: "Data access",
      },
    ]);
    expect(edges[0]?.type).toBeUndefined();
    expect(edges[3]?.type).toBeUndefined();
  });
});

describe("ReciprocalArchitectureEdge", () => {
  const baseProps: EdgeProps<ArchitectureFlowEdge> = {
    id: "a-b",
    source: "a",
    target: "b",
    data: { kind: "request-response" },
    sourceX: 0,
    sourceY: 20,
    targetX: 200,
    targetY: 20,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    markerEnd: "url(#arrowclosed)",
    label: "Request/response",
    labelShowBg: true,
    labelStyle: { fill: "var(--text-secondary)" },
    labelBgStyle: { fill: "var(--surface)" },
  };

  it("renders the displaced path, arrowhead, and semantic label through BaseEdge", () => {
    const markup = renderToStaticMarkup(
      <svg><ReciprocalArchitectureEdge {...baseProps} /></svg>,
    );

    expect(markup).toContain('d="M 0,20 C ');
    expect(markup).toContain(" 200,20\"");
    expect(markup).toContain('marker-end="url(#arrowclosed)"');
    expect(markup).toContain("Request/response");
    expect(markup).toContain("translate(100 38)");
    expect(markup).toContain("var(--surface)");
  });

  it("keeps Generic edges visibly unlabeled", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <ReciprocalArchitectureEdge
          {...baseProps}
          data={{ kind: "generic" }}
          label={undefined}
          labelShowBg={false}
        />
      </svg>,
    );

    expect(markup).not.toContain("react-flow__edge-textwrapper");
    expect(markup).toContain('marker-end="url(#arrowclosed)"');
  });
});
