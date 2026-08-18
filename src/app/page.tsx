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
    <div className="flex flex-1 flex-col">
      <header className="border-b border-foreground/10">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight">Architekt</h1>
          <p className="mt-1 text-sm text-foreground/70">
            A foundation for clear, editable software architecture diagrams.
          </p>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <section className="w-full max-w-xl rounded-lg border border-foreground/15 px-6 py-10 text-center sm:px-10">
          <h2 className="text-lg font-semibold">Workspace</h2>
          <div className="mt-6">
            <StaticDiagram nodes={nodes} edges={edges} />
          </div>
        </section>
      </main>
    </div>
  );
}
