# Architekt

Architekt is a system-design application being built as a production-quality portfolio project. Its goal is to help people turn software-system ideas into clear, editable architecture diagrams while keeping the underlying model understandable and maintainable.

## Current status

The **Project foundation**, **Domain graph foundation**, **Static Diagram Rendering**, **Interactive Node Movement**, **Component Creation and Deletion**, **Connection Creation**, and **Connection Deletion** milestones are complete. The repository provides a minimal branded application shell, a framework-independent architecture graph, controlled React Flow node dragging backed by application-owned layout state, deliberate component and connection deletion, and validated directional connection creation. Local persistence is implemented: the editor loads, automatically saves, and explicitly resets its single saved workspace. Browser-level recovery verification remains pending.

## Currently implemented

- A Next.js App Router application with TypeScript and Tailwind CSS
- A responsive, semantic Architekt application shell
- An immutable, framework-independent `ArchitectureGraph` with directional connections and invariant enforcement
- A React Flow adapter that produces renderer-specific `Node[]` and `Edge[]` from the canonical graph
- Application-owned node positions with renderer-only measured dimensions kept outside the domain graph
- A compact component form and component list for creating and deleting architecture components
- React Flow connection gestures translated into domain-validated directional connections without renderer-owned canonical edges
- A graph-derived connection list for deleting directional connections without enabling canvas selection
- A `StaticDiagram` with panning, zooming, node dragging, connection creation, and initial `fitView` framing; selection and edge reconnection remain disabled
- A framework-independent V1 codec that validates and restores persisted graph and position data through domain operations
- A typed localStorage adapter with an injected, browser-free test seam and explicit failure results
- A hydration-safe loading boundary that resolves saved, missing, recovery-required, and memory-only editor modes before mounting React Flow
- A 300 ms trailing autosave for graph and position changes, with truthful save-failure feedback and explicit Retry
- Clear-first recovery reset for invalid or unsupported saved workspaces, guarded by native confirmation
- Vitest coverage for domain behavior, layout behavior, renderer adaptation, coordinated editor state, and persistence behavior (127 tests)
- Project-level test, lint, and production build commands
- Repository guidance that documents engineering, architecture, and visual-system boundaries

## Planned vision

The long-term vision is a workspace where a user can describe a software system and receive a clean, editable architecture diagram. Planned capabilities include deliberate diagram editing, persistence, custom nodes, layout logic, and carefully bounded AI assistance.

Component creation and deletion, node movement, and connection creation and deletion are implemented. The persistence data contract, codec, storage adapter, post-mount loading path, debounced automatic saving, and explicit recovery reset are implemented. Custom nodes, layout logic, AI integration, authentication, and collaboration remain planned only.

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

This project is being built incrementally, with each milestone focused on a clear boundary and verifiable outcome. The project foundation, domain graph foundation, static diagram rendering, interactive node movement, component creation and deletion, connection creation, and connection deletion milestones are complete.

The current persistence milestone's implementation is complete; browser-level recovery verification remains. Planned functionality will be documented as implemented only when it is present, validated, and maintainable.
