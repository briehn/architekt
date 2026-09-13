import { describe, expect, it, vi } from "vitest";

import type { Node } from "@xyflow/react";
import type { ComponentId } from "../domain/identifiers";
import { requestComponentRenameFromNode } from "./static-diagram";

describe("requestComponentRenameFromNode", () => {
  it("reports the React Flow node ID as the component ID", () => {
    const onNodeRenameRequested = vi.fn();
    const node = { id: "api" } as Pick<Node, "id">;

    requestComponentRenameFromNode(node, onNodeRenameRequested);

    expect(onNodeRenameRequested).toHaveBeenCalledWith("api" as ComponentId);
  });
});
