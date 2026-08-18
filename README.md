# Architekt

Architekt is a system-design application being built as a production-quality portfolio project. Its goal is to help people turn software-system ideas into clear, editable architecture diagrams while keeping the underlying model understandable and maintainable.

## Current status

The **Project foundation**, **Domain graph foundation**, and **Static Diagram Rendering** milestones are complete. The repository provides a minimal branded application shell, a framework-independent architecture graph, and a read-only React Flow diagram rendering path.

## Currently implemented

- A Next.js App Router application with TypeScript and Tailwind CSS
- A responsive, semantic Architekt application shell
- An immutable, framework-independent `ArchitectureGraph` with directional connections and invariant enforcement
- A React Flow adapter that produces renderer-specific `Node[]` and `Edge[]` from the canonical graph
- A read-only `StaticDiagram` with panning, zooming, and initial `fitView` framing; node dragging, connecting, selecting, and edge reconnection are disabled
- Vitest coverage for domain behavior and the renderer adapter (31 tests)
- Project-level test, lint, and production build commands
- Repository guidance that documents engineering, architecture, and visual-system boundaries

## Planned vision

The long-term vision is a workspace where a user can describe a software system and receive a clean, editable architecture diagram. Planned capabilities include deliberate diagram editing, persistence, custom nodes, layout logic, and carefully bounded AI assistance.

Diagram editing, persistence, custom nodes, layout logic, AI integration, authentication, and collaboration are planned only. React Flow currently serves only as a read-only renderer.

## Architecture principle

The domain graph is the canonical source of truth. It remains independent from React Flow and other rendering concerns:

```text
User input → validated command → domain graph → renderer
```

The React Flow adapter renders an adapted `Node[]` and `Edge[]` view of the domain graph rather than becoming canonical application state. This keeps domain behavior testable without a browser or UI library and gives future manual edits and AI output a shared, validated path into the system.

## Tech stack

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- ESLint

## Local setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

Run the standard checks before handing off changes:

```bash
npm run lint
npm run build
```

## Roadmap

This project is being built incrementally, with each milestone focused on a clear boundary and verifiable outcome. The project foundation, domain graph foundation, and static diagram rendering milestones are complete.

The next work remains deliberate diagram interaction and its translation into validated domain operations. Planned functionality will be documented as implemented only when it is present, validated, and maintainable.
