import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import type { ComponentId } from "../domain/identifiers";
import {
  ArchitektNode,
  areArchitektNodeHandlesConnectable,
  type ArchitektFlowNode,
} from "./architekt-node";

function nodeProps(
  rename: ArchitektFlowNode["data"]["rename"],
): NodeProps<ArchitektFlowNode> {
  return {
    data: { label: "API", rename, focusRequestId: null },
    id: "api",
    isConnectable: true,
  } as NodeProps<ArchitektFlowNode>;
}

describe("ArchitektNode", () => {
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
  });

  it("disables handles only while the node is being renamed", () => {
    expect(areArchitektNodeHandlesConnectable(true, false)).toBe(true);
    expect(areArchitektNodeHandlesConnectable(true, true)).toBe(false);
    expect(areArchitektNodeHandlesConnectable(false, false)).toBe(false);
  });
});
