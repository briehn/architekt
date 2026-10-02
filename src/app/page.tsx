import { ArchitectureEditor } from "../diagram/architecture-editor";

export default function Home() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <main className="flex min-h-0 flex-1 flex-col">
        <section
          aria-label="Architecture diagram"
          className="flex min-h-0 flex-1 overflow-hidden bg-surface"
        >
          <ArchitectureEditor />
        </section>
      </main>
    </div>
  );
}
