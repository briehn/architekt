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

  it("keeps mixed reciprocal handles, semantics, and pair removal independent", () => {
    const nodes = [node("client", "Client", 0, 0), node("cache", "Cache", 250, 150)];
    const forward = edge("client-cache", "client", "cache", "request-response");
    const reverse = edge("cache-client", "cache", "client", "async-messaging");
    const paired = deriveEdges([forward, reverse], nodes);

    expect(paired).toMatchObject([
      {
        type: RECIPROCAL_EDGE_TYPE, sourceHandle: "anchor-right", targetHandle: "anchor-top",
        markerEnd: { type: "arrowclosed" },
        label: "Request/response", ariaLabel: "Client to Cache, Request/response",
      },
      {
        type: RECIPROCAL_EDGE_TYPE, sourceHandle: "anchor-top", targetHandle: "anchor-right",
        markerEnd: { type: "arrowclosed" },
        label: "Async messaging", ariaLabel: "Cache to Client, Async messaging",
      },
    ]);
    expect(deriveEdges([reverse, forward], [...nodes].reverse()).map((derived) => [
      derived.id, derived.sourceHandle, derived.targetHandle,
    ])).toEqual([
      ["cache-client", "anchor-top", "anchor-right"],
      ["client-cache", "anchor-right", "anchor-top"],
    ]);
    const ordinary = deriveEdges([forward], nodes)[0];
    expect(ordinary?.type).toBeUndefined();
    expect(ordinary).toMatchObject({
      sourceHandle: "anchor-right", targetHandle: "anchor-top",
      markerEnd: { type: "arrowclosed" },
    });
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

  it("rederives opposing reciprocal handles after node movement", () => {
    const pair = [edge("a-b", "a", "b"), edge("b-a", "b", "a")];
    const horizontal = deriveEdges(pair, [node("a", "A", 0, 0), node("b", "B", 400, 0)]);
    const vertical = deriveEdges(pair, [node("a", "A", 0, 0), node("b", "B", 0, 400)]);

    expect(horizontal.map(({ sourceHandle, targetHandle }) => [sourceHandle, targetHandle]))
      .toEqual([["anchor-right", "anchor-left"], ["anchor-left", "anchor-right"]]);
    expect(vertical.map(({ sourceHandle, targetHandle }) => [sourceHandle, targetHandle]))
      .toEqual([["anchor-bottom", "anchor-top"], ["anchor-top", "anchor-bottom"]]);
    expect(vertical.map(({ type }) => type))
      .toEqual([RECIPROCAL_EDGE_TYPE, RECIPROCAL_EDGE_TYPE]);
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

  it("renders the shared center path, target arrowhead, and semantic label through BaseEdge", () => {
    const markup = renderToStaticMarkup(
      <svg><ReciprocalArchitectureEdge {...baseProps} /></svg>,
    );

    expect(markup).toContain('d="M0,20 C100,20 100,20 200,20"');
    expect(markup).toContain('marker-end="url(#arrowclosed)"');
    expect(markup).toContain("Request/response");
    expect(markup).toContain("translate(100 38)");
    expect(markup).toContain("var(--surface)");
  });

  it.each([
    ["horizontal", 0, 20, 200, 20, Position.Right, Position.Left],
    ["vertical", 10, 0, 10, 100, Position.Bottom, Position.Top],
    ["diagonal", 0, 0, 60, 80, Position.Right, Position.Left],
    ["mixed right/top", 176, 36, 338, 150, Position.Right, Position.Top],
  ] as const)("keeps two %s directions, target markers, and labels separate", (
    _name, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  ) => {
    const forward = renderToStaticMarkup(<svg><ReciprocalArchitectureEdge
      {...baseProps}
      sourceX={sourceX} sourceY={sourceY}
      targetX={targetX} targetY={targetY}
      sourcePosition={sourcePosition} targetPosition={targetPosition}
    /></svg>);
    const reverse = renderToStaticMarkup(<svg><ReciprocalArchitectureEdge
      {...baseProps}
      id="b-a" source="b" target="a"
      sourceX={targetX} sourceY={targetY}
      targetX={sourceX} targetY={sourceY}
      sourcePosition={targetPosition} targetPosition={sourcePosition}
      label="Async messaging"
    /></svg>);

    expect(forward).toContain(`d="M${sourceX},${sourceY} C`);
    expect(forward).toContain(` ${targetX},${targetY}"`);
    expect(reverse).toContain(`d="M${targetX},${targetY} C`);
    expect(reverse).toContain(` ${sourceX},${sourceY}"`);
    expect(forward.match(/marker-end="url\(#arrowclosed\)"/g)).toHaveLength(1);
    expect(reverse.match(/marker-end="url\(#arrowclosed\)"/g)).toHaveLength(1);
    expect(forward).toContain("Request/response");
    expect(reverse).toContain("Async messaging");
    expect(forward.match(/translate\(([^)]+)\)/)?.[1])
      .not.toBe(reverse.match(/translate\(([^)]+)\)/)?.[1]);
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

  it("shows only the semantic label in a Generic and semantic pair", () => {
    const markup = renderToStaticMarkup(<svg>
      <ReciprocalArchitectureEdge {...baseProps} />
      <ReciprocalArchitectureEdge
        {...baseProps}
        id="b-a" source="b" target="a"
        sourceX={200} targetX={0}
        sourcePosition={Position.Left} targetPosition={Position.Right}
        data={{ kind: "generic" }} label={undefined} labelShowBg={false}
      />
    </svg>);

    expect(markup.match(/react-flow__edge-textwrapper/g)).toHaveLength(1);
    expect(markup).toContain("Request/response");
    expect(markup.match(/marker-end="url\(#arrowclosed\)"/g)).toHaveLength(2);
  });

  it("shows no labels for two Generic directions", () => {
    const markup = renderToStaticMarkup(<svg>
      <ReciprocalArchitectureEdge {...baseProps} data={{ kind: "generic" }} label={undefined} />
      <ReciprocalArchitectureEdge
        {...baseProps}
        id="b-a" source="b" target="a"
        sourceX={200} targetX={0}
        sourcePosition={Position.Left} targetPosition={Position.Right}
        data={{ kind: "generic" }} label={undefined}
      />
    </svg>);

    expect(markup).not.toContain("react-flow__edge-textwrapper");
    expect(markup.match(/marker-end="url\(#arrowclosed\)"/g)).toHaveLength(2);
  });
});
