import { describe, expect, it } from "vitest";

import { EMPTY_DESIGN_CONTEXT, type DesignContext } from "./design-context";
import { exportArchitectureMarkdown } from "./architecture-markdown-export";
import { ARCHITECTURE_COMPONENT_KINDS, type ArchitectureComponentKind } from "../domain/architecture-component";
import { ARCHITECTURE_CONNECTION_KINDS, type ArchitectureConnectionKind } from "../domain/architecture-connection";
import { ArchitectureGraph } from "../domain/architecture-graph";
import type { BoundaryId, ComponentId, ConnectionId } from "../domain/identifiers";

type ComponentFixture = readonly [id: string, name: string, kind: ArchitectureComponentKind];
type ConnectionFixture = readonly [id: string, source: string, target: string, kind: ArchitectureConnectionKind];
type BoundaryFixture = readonly [id: string, name: string, members: readonly string[]];

function graphWith(
  components: readonly ComponentFixture[] = [],
  connections: readonly ConnectionFixture[] = [],
  boundaries: readonly BoundaryFixture[] = [],
): ArchitectureGraph {
  let graph = ArchitectureGraph.empty();
  for (const [id, name, kind] of components) {
    const result = graph.addComponent({ id: id as ComponentId, name, kind });
    if (!result.ok) throw new Error(`Rejected component ${id}`);
    graph = result.graph;
  }
  for (const [id, source, target, kind] of connections) {
    const result = graph.addConnection({ id: id as ConnectionId, sourceComponentId: source as ComponentId, targetComponentId: target as ComponentId, kind });
    if (!result.ok) throw new Error(`Rejected connection ${id}`);
    graph = result.graph;
  }
  for (const [id, name, members] of boundaries) {
    const result = graph.addBoundary({ id: id as BoundaryId, name, memberComponentIds: members.map((member) => member as ComponentId) });
    if (!result.ok) throw new Error(`Rejected boundary ${id}`);
    graph = result.graph;
  }
  return graph;
}

function exportWith(graph: ArchitectureGraph, context: DesignContext = EMPTY_DESIGN_CONTEXT) {
  return exportArchitectureMarkdown({ graph, designContext: context });
}

describe("architecture Markdown export", () => {
  it("keeps all sections for an empty document and uses a presentation-only title", () => {
    const result = exportWith(ArchitectureGraph.empty());
    expect(result.filename).toBe("architecture.md");
    expect(result.markdown).toBe(
      "# Untitled architecture\n\n## Overview\n\n- Components: 0\n- Connections: 0\n- Boundaries: 0\n\nDesign Brief prose is user-authored and unverified.\n\n## Requirements and constraints\n\nNot provided.\n\n## Assumptions and open questions\n\nNot provided.\n\n## Decisions and tradeoffs\n\nNot provided.\n\n## Components\n\nNone modeled.\n\n## Boundaries\n\nNone modeled.\n\n## Connections\n\nNone modeled.\n",
    );
  });

  it("exports only committed context for context-only and partially filled documents", () => {
    const context = { ...EMPTY_DESIGN_CONTEXT, title: "Order Design", requirementsAndConstraints: "Keep orders durable", decisionsAndTradeoffs: "Queue adds delay" };
    const { filename, markdown } = exportWith(ArchitectureGraph.empty(), context);
    expect(filename).toBe("order-design.md");
    expect(markdown).toContain("## Requirements and constraints\n\nKeep orders durable");
    expect(markdown).toContain("## Assumptions and open questions\n\nNot provided.");
    expect(markdown).toContain("## Decisions and tradeoffs\n\nQueue adds delay");
    expect(markdown).toContain("## Components\n\nNone modeled.");
  });

  it("includes every component and connection kind, directed reciprocity, and populated/empty boundaries", () => {
    const components = ARCHITECTURE_COMPONENT_KINDS.map((kind, index) => [String(index), `Node ${index}`, kind] as const);
    const connections = ARCHITECTURE_CONNECTION_KINDS.map((kind, index) => [String(index), String(index), String(index + 1), kind] as const);
    connections.push(["reverse", "1", "0", "streaming"]);
    const graph = graphWith(components, connections, [["working", "Working", ["2", "0"]], ["future", "Future", []]]);
    const markdown = exportWith(graph).markdown;
    for (const kind of ["Generic", "Client", "Service", "Database", "Cache", "Queue", "Gateway", "Storage", "External service"]) {
      expect(markdown).toContain(`— ${kind}`);
    }
    for (const kind of ["Generic", "Request/response", "Async messaging", "Streaming", "Data access"]) {
      expect(markdown).toContain(`— ${kind}`);
    }
    expect(markdown).toContain("- Node 0 → Node 1 — Generic");
    expect(markdown).toContain("- Node 1 → Node 0 — Streaming");
    expect(markdown).toContain("### Future\n\nNo members.");
    expect(markdown).toContain("### Working\n\n- Node 0\n- Node 2");
  });

  it("uses kind before ID to distinguish duplicate names and IDs for remaining ambiguity", () => {
    const graph = graphWith(
      [["a", "API", "service"], ["b", "API", "database"], ["c", "API", "service"], ["d", "Client", "client"]],
      [["request", "d", "a", "request-response"], ["read", "a", "b", "data-access"]],
      [["left", "Core", ["a", "b"]], ["right", "Core", ["c"]]],
    );
    const markdown = exportWith(graph).markdown;
    expect(markdown).toContain('- API (ID: "a") — Service');
    expect(markdown).toContain('- API — Database');
    expect(markdown).toContain('- API (ID: "c") — Service');
    expect(markdown).toContain('- Client → API (Service, ID: "a") — Request/response');
    expect(markdown).toContain('- API (Service, ID: "a") → API (Database) — Data access');
    expect(markdown).toContain('### Core (ID: "left")');
    expect(markdown).toContain('### Core (ID: "right")');
  });

  it("escapes Markdown and HTML while preserving Unicode, paragraphs, line breaks, and text", () => {
    const graph = graphWith([["name", "A\r\nB <script>*", "service"]], [], [["b", "Core\n& Team", ["name"]]]);
    const context = {
      title: "Café\r\n# Plan <draft>",
      requirementsAndConstraints: "**literal** <script>alert(1)</script>\r\nNext line\r\rParagraph & emoji 😀",
      assumptionsAndOpenQuestions: "  leading spaces\n\tindented",
      decisionsAndTradeoffs: "- option [x](https://example.com) @someone",
    };
    const markdown = exportWith(graph, context).markdown;
    expect(markdown).toContain("# Café \\# Plan &lt;draft&gt;");
    expect(markdown).toContain("\\*\\*literal\\*\\* &lt;script&gt;alert\\(1\\)&lt;/script&gt;\\\nNext line\n\nParagraph &amp; emoji 😀");
    expect(markdown).toContain("&#32;&#32;leading spaces\\\n&#9;indented");
    expect(markdown).toContain("\\- option \\[x\\]\\(https://example\\.com\\) &#64;someone");
    expect(markdown).toContain("- A B &lt;script&gt;\\* — Service");
    expect(markdown).toContain("### Core &amp; Team");
    expect(markdown).not.toContain("\r");
    expect(markdown).toMatch(/[^\n]\n$/);
    expect(markdown).not.toMatch(/\n\n$/);
  });

  it("sorts by normalized names and IDs independently of graph insertion order and omits transient state", () => {
    const components: ComponentFixture[] = [["z", "Zeta", "service"], ["a", "Alpha", "client"], ["b", "Alpha", "database"]];
    const connections: ConnectionFixture[] = [["z", "z", "a", "request-response"], ["a", "a", "b", "data-access"]];
    const boundaries: BoundaryFixture[] = [["z", "Zeta", ["z"]], ["a", "Alpha", ["b", "a"]]];
    const first = graphWith(components, connections, boundaries);
    const second = graphWith([...components].reverse(), [...connections].reverse(), [...boundaries].reverse());
    const context = { ...EMPTY_DESIGN_CONTEXT, title: "Graph only" };
    const firstMarkdown = exportWith(first, context).markdown;
    expect(firstMarkdown).toBe(exportWith(second, context).markdown);
    expect(firstMarkdown.indexOf("- Alpha — Client")).toBeLessThan(firstMarkdown.indexOf("- Zeta — Service"));
    expect(firstMarkdown).not.toMatch(/nodePositions|viewport|history|selection|measurements|prompt|proposal|voice|findings/);
    expect(firstMarkdown).toMatch(/[^\n]\n$/);
  });
});
