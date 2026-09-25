import { ConnectionMode, type ReactFlowProps } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ComponentId } from "../domain/identifiers";
import type { ArchitektFlowNode } from "./architekt-node";
import { StaticDiagram } from "./static-diagram";
import type {
  ArchitectureFlowEdge,
  ArchitectureFlowNode,
} from "./react-flow-adapter";

const renderedReactFlow = vi.hoisted(() => ({
  props: null as ReactFlowProps | null,
}));

vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      renderedReactFlow.props = props;
      return null;
    },
  };
});

describe("StaticDiagram connection mode", () => {
  it("wires controlled selection and native Delete/Backspace to one guarded canonical callback", async () => {
    const nodes: ArchitectureFlowNode[] = [{
      id: "a", data: { componentId: "a" as ComponentId, name: "A", kind: "service" },
      position: { x: 0, y: 0 },
    }];
    const canDeleteSelectedNodes = vi.fn(() => true);
    const onSelectedNodesDelete = vi.fn();
    renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes} edges={[]} selectedComponentIds={new Set(["a" as ComponentId])}
        canDeleteSelectedNodes={canDeleteSelectedNodes}
        onSelectedNodesDelete={onSelectedNodesDelete}
        onConnect={vi.fn()} onNodeDragStart={vi.fn()} onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()} onNodeRenameRequested={vi.fn()}
        canvasRename={null} canvasNodeFocusRequest={null} autoLayoutFitRequestId={0}
      />,
    );
    const props = renderedReactFlow.props!;
    expect(props.elementsSelectable).toBe(true);
    expect(props.deleteKeyCode).toEqual(["Delete", "Backspace"]);
    expect(props.nodes?.[0]).toMatchObject({ id: "a", selected: true });
    expect(await props.onBeforeDelete?.({ nodes: props.nodes!, edges: [] })).toMatchObject({ nodes: props.nodes });
    props.onNodesDelete?.(props.nodes!);
    expect(onSelectedNodesDelete).toHaveBeenCalledWith(["a"]);
    canDeleteSelectedNodes.mockReturnValue(false);
    expect(await props.onBeforeDelete?.({ nodes: props.nodes!, edges: [] })).toBe(false);
    expect(await props.onBeforeDelete?.({ nodes: [], edges: [] })).toBe(false);
    expect(nodes[0].selected).toBeUndefined();
  });

  it("disables only the renamed component even when rename is in the list", () => {
    const nodes: ArchitectureFlowNode[] = ["a", "b"].map((id) => ({
      id,
      data: { componentId: id as ComponentId, name: id, kind: "service" },
      position: { x: 0, y: 0 },
    }));
    renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes} edges={[]}
        onConnect={vi.fn()} onNodeDragStart={vi.fn()} onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()} onNodeRenameRequested={vi.fn()}
        canvasRename={null} activeRenameComponentId={"a" as ComponentId}
        canvasNodeFocusRequest={null} autoLayoutFitRequestId={0}
      />,
    );
    expect(renderedReactFlow.props?.nodes).toMatchObject([
      { id: "a", connectable: false, data: { rename: null } },
      { id: "b", connectable: true },
    ]);
    expect(nodes[0].connectable).toBeUndefined();
  });

  it("uses loose native connections while passing controlled nodes, edges, and onConnect", () => {
    const nodes: ArchitectureFlowNode[] = [
      {
        id: "a",
        data: { componentId: "a" as ComponentId, name: "A", kind: "service" },
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        data: { componentId: "b" as ComponentId, name: "B", kind: "cache" },
        position: { x: 400, y: 0 },
      },
    ];
    const edges: ArchitectureFlowEdge[] = [{
      id: "a-to-b",
      source: "a",
      target: "b",
      data: { kind: "streaming" },
      markerEnd: { type: "arrowclosed" },
    }];
    const onConnect = vi.fn();

    const markup = renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
        onNodeDragStart={vi.fn()}
        onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()}
        canvasRename={null}
        canvasNodeFocusRequest={null}
        autoLayoutFitRequestId={0}
        onNodeRenameRequested={vi.fn()}
      />,
    );

    expect(markup).toContain('id="architekt-anchor-keyboard-instructions"');
    expect(markup).toContain("Use arrow keys to choose a connection side.");

    expect(renderedReactFlow.props).toMatchObject({
      connectionMode: ConnectionMode.Loose,
      connectionDragThreshold: 5,
      connectOnClick: false,
      nodesDraggable: true,
      nodesConnectable: true,
      elementsSelectable: true,
      edgesReconnectable: false,
    });
    expect(renderedReactFlow.props?.onConnect).toBe(onConnect);
    expect(renderedReactFlow.props?.nodes).toMatchObject([
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 400, y: 0 } },
    ]);
    expect(renderedReactFlow.props?.edges).toMatchObject([
      {
        source: "a",
        target: "b",
        sourceHandle: "anchor-right",
        targetHandle: "anchor-left",
        markerEnd: { type: "arrowclosed" },
        label: "Streaming",
        ariaLabel: "A to B, Streaming",
      },
    ]);
    expect(edges[0]).not.toHaveProperty("sourceHandle");
  });

  it("uses one click/tap controller and suppresses the click following a native drag", () => {
    const nodes: ArchitectureFlowNode[] = [
      {
        id: "a",
        data: { componentId: "a" as ComponentId, name: "A", kind: "service" },
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        data: { componentId: "b" as ComponentId, name: "B", kind: "cache" },
        position: { x: 400, y: 0 },
      },
    ];
    const onConnect = vi.fn();
    const onPointerAnchorActivated = vi.fn();
    const onPointerConnectionCancelled = vi.fn();

    renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes}
        edges={[]}
        onConnect={onConnect}
        onNodeDragStart={vi.fn()}
        onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()}
        canvasRename={null}
        canvasNodeFocusRequest={null}
        autoLayoutFitRequestId={0}
        pendingPointerConnectionSource={null}
        onPointerAnchorActivated={onPointerAnchorActivated}
        onPointerConnectionCancelled={onPointerConnectionCancelled}
        onNodeRenameRequested={vi.fn()}
      />,
    );

    const flowNodes = renderedReactFlow.props?.nodes as ArchitektFlowNode[];
    const firstAnchor = flowNodes[0].data.pointerConnection;
    const secondAnchor = flowNodes[1].data.pointerConnection;
    expect(firstAnchor).toBeDefined();
    expect(secondAnchor).toBeDefined();

    firstAnchor?.onAnchorPointerDown();
    firstAnchor?.onAnchorClick("top");
    expect(onPointerAnchorActivated).toHaveBeenCalledExactlyOnceWith(
      "a", "top",
    );

    onPointerAnchorActivated.mockClear();
    firstAnchor?.onAnchorPointerDown();
    renderedReactFlow.props?.onConnectStart?.(
      {} as MouseEvent,
      { nodeId: "a", handleId: "anchor-top", handleType: "source" },
    );
    renderedReactFlow.props?.onConnect?.({
      source: "a", target: "b",
      sourceHandle: "anchor-top", targetHandle: "anchor-left",
    });
    secondAnchor?.onAnchorClick("left");

    expect(onConnect).toHaveBeenCalledExactlyOnceWith({
      source: "a", target: "b",
      sourceHandle: "anchor-top", targetHandle: "anchor-left",
    });
    expect(onPointerConnectionCancelled).toHaveBeenCalledTimes(1);
    expect(onPointerAnchorActivated).not.toHaveBeenCalled();

    secondAnchor?.onAnchorActivate("bottom");
    expect(onPointerAnchorActivated).toHaveBeenCalledExactlyOnceWith(
      "b", "bottom",
    );
    onPointerAnchorActivated.mockClear();

    secondAnchor?.onAnchorPointerDown();
    secondAnchor?.onAnchorClick("left");
    expect(onPointerAnchorActivated).toHaveBeenCalledExactlyOnceWith(
      "b", "left",
    );
    renderedReactFlow.props?.onPaneClick?.({} as never);
    expect(onPointerConnectionCancelled).toHaveBeenCalledTimes(2);
  });

  it("disambiguates duplicate component names only when naming anchors", () => {
    const nodes: ArchitectureFlowNode[] = [
      {
        id: "a",
        data: { componentId: "a" as ComponentId, name: "Service", kind: "service" },
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        data: { componentId: "b" as ComponentId, name: "Service", kind: "service" },
        position: { x: 400, y: 0 },
      },
    ];

    renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes}
        edges={[]}
        onConnect={vi.fn()}
        onNodeDragStart={vi.fn()}
        onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()}
        canvasRename={null}
        canvasNodeFocusRequest={null}
        autoLayoutFitRequestId={0}
        pendingPointerConnectionSource={{
          componentId: "a" as ComponentId,
          side: "right",
        }}
        onNodeRenameRequested={vi.fn()}
      />,
    );

    const flowNodes = renderedReactFlow.props?.nodes as ArchitektFlowNode[];
    expect(flowNodes[0].data.pointerConnection).toMatchObject({
      accessibleComponentName: "Service (a)",
      pendingSourceAccessibleName: "Service (a)",
      pendingSourceSide: "right",
    });
    expect(flowNodes[1].data.pointerConnection).toMatchObject({
      accessibleComponentName: "Service (b)",
      pendingSourceAccessibleName: "Service (a)",
      destinationAvailable: true,
    });
  });

  it("registers reciprocal rendering only for paired directions", () => {
    const nodes: ArchitectureFlowNode[] = [
      {
        id: "a",
        data: { componentId: "a" as ComponentId, name: "A", kind: "service" },
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        data: { componentId: "b" as ComponentId, name: "B", kind: "cache" },
        position: { x: 400, y: 0 },
      },
    ];
    const edges: ArchitectureFlowEdge[] = [
      {
        id: "a-b", source: "a", target: "b",
        data: { kind: "request-response" }, markerEnd: { type: "arrowclosed" },
      },
      {
        id: "b-a", source: "b", target: "a",
        data: { kind: "generic" }, markerEnd: { type: "arrowclosed" },
      },
    ];

    renderToStaticMarkup(
      <StaticDiagram
        nodes={nodes}
        edges={edges}
        onConnect={vi.fn()}
        onNodeDragStart={vi.fn()}
        onNodeDragStop={vi.fn()}
        onNodesChange={vi.fn()}
        canvasRename={null}
        canvasNodeFocusRequest={null}
        autoLayoutFitRequestId={0}
        onNodeRenameRequested={vi.fn()}
      />,
    );

    expect(typeof renderedReactFlow.props?.edgeTypes?.reciprocal).toBe("function");
    expect(renderedReactFlow.props?.edges).toMatchObject([
      {
        type: "reciprocal", source: "a", target: "b",
        sourceHandle: "anchor-right", targetHandle: "anchor-left",
        markerEnd: { type: "arrowclosed" },
        label: "Request/response", ariaLabel: "A to B, Request/response",
      },
      {
        type: "reciprocal", source: "b", target: "a",
        sourceHandle: "anchor-left", targetHandle: "anchor-right",
        markerEnd: { type: "arrowclosed" },
        label: undefined, ariaLabel: "B to A, Generic",
      },
    ]);
    expect(edges.every((edge) => edge.type === undefined)).toBe(true);
  });
});
