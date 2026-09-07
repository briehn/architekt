import { ArchitectureEditor } from "../diagram/architecture-editor";

export default function Home() {
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
          <ArchitectureEditor />
        </section>
      </main>
    </div>
  );
}