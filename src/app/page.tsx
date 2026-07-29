export default function Home() {
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
          <p className="mt-2 text-sm text-foreground/70">
            Diagramming will appear here in a future milestone.
          </p>
        </section>
      </main>
    </div>
  );
}
