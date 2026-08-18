import { ArchitectureGraph } from "../domain/architecture-graph";
import { toReactFlowDiagram } from "../diagram/react-flow-adapter";
import { StaticDiagram } from "../diagram/static-diagram";
import type { ComponentId, ConnectionId } from "../domain/identifiers";

function componentId(value: string): ComponentId {
  return value as ComponentId;
}
function connectionId(value: string): ConnectionId {
  return value as ConnectionId;
}

function createExampleArchitectureGraph(): ArchitectureGraph {
  const graph = ArchitectureGraph.empty();
  const api = {
    id: componentId("api"),
    name: "API",
  };
  const db = {
    id: componentId("database"),
    name: "Database",
  };
  const apiToDB = {
    id: connectionId("api-to-database"),
    sourceComponentId: api.id,
    targetComponentId: db.id,
  };

  const apiResult = graph.addComponent(api);
  if (!apiResult.ok) {
    return graph;
  }

  const dbResult = apiResult.graph.addComponent(db);
  if (!dbResult.ok) {
    return graph;
  }

  const connectionResult = dbResult.graph.addConnection(apiToDB);
  if (!connectionResult.ok) {
    return graph;
  }

  return connectionResult.graph;
}

export default function Home() {
  const graph = createExampleArchitectureGraph();

  const { nodes, edges } = toReactFlowDiagram(graph);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <header className="h-14 shrink-0 border-b border-border bg-surface">
        <div className="flex h-full items-center px-4 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">
            Architekt
          </h1>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-6">
        <section
          aria-label="Architecture diagram"
          className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface"
        >
          <StaticDiagram nodes={nodes} edges={edges} />
        </section>
      </main>
    </div>
  );
}
