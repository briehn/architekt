# Architekt TODO

## Completed milestone: Project foundation

### Goal

Establish a clean, working application foundation before introducing diagramming, state management, persistence, or AI features.

**Milestone status: Complete.**

### Completed tasks

* [x] Scaffold the Next.js application
* [x] Enable TypeScript, Tailwind CSS, ESLint, the App Router, and the `src/` directory
* [x] Add repository-level coding-agent instructions
* [x] Replace the generated starter page with a minimal Architekt application shell
* [x] Replace the generated README with an Architekt-specific README
* [x] Create the initial architecture documentation
* [x] Verify the application with lint and production build commands

## Completed milestone: Domain graph foundation

### Goal

Establish the smallest useful framework-independent domain graph: architecture components, connections between them, explicit invariants, and deterministic operations verified by meaningful tests.

The domain graph remains independent from React, Next.js, React Flow, Zustand, persistence, and AI concerns.

**Milestone status: Complete.**

### Completed tasks

* [x] Define a minimal architecture component with stable identity and a human-readable name
* [x] Define a minimal directional connection between two architecture components, including the identity needed by supported operations
* [x] Define an immutable graph aggregate that owns components and connections as canonical domain state
* [x] Decide and document the initial graph invariants:
  * component and connection identifier uniqueness
  * endpoint validity
  * duplicate-connection policy
  * self-connection policy
  * component-removal behavior
* [x] Decide how domain operations report predictable success and rejection outcomes without coupling behavior to a UI or framework
* [x] Implement the deterministic operation set needed to create and modify the graph while preserving the adopted invariants
* [x] Configure Vitest and add the `npm run test` script for domain tests
* [x] Test meaningful success and failure behavior through the domain model's public API, including invariant enforcement and removal effects (27 tests pass)
* [x] Update `ARCHITECTURE.md` with the domain decisions adopted during the milestone
* [x] Verify tests, lint, production build, and framework independence

## Not in scope

Do not implement these during this milestone:

* React Flow installation, adapters, or rendering
* React or Next.js integration with the domain graph
* Zustand or other application state management
* Zod or other external-input validation
* UI diagram editing
* Persistence or serialization design
* Authentication
* AI integration
* Capacity calculations
* Version history or undo/redo
* Collaboration
* A broad catalog or hierarchy of infrastructure component types
* Layout coordinates, visual styling, or renderer-specific metadata in the domain model

## Completion criteria

This milestone is complete when:

* The repository has a minimal graph model for components and connections
* Graph invariants are documented and enforced by deterministic domain operations
* Meaningful domain tests cover accepted operations, rejected operations, and removal behavior
* Domain tests run without React, Next.js, React Flow, a browser, persistence, or AI
* `npm run test`, `npm run lint`, and `npm run build` succeed
* `ARCHITECTURE.md` reflects the implemented domain decisions without specifying future infrastructure

## Completed milestone: Static Diagram Rendering

### Goal

Render the canonical domain graph through React Flow without making React Flow state canonical or introducing editing behavior.

**Milestone status: Complete.**

### Completed tasks

* [x] Add a renderer adapter that converts `ArchitectureGraph` components and connections into React Flow `Node[]` and `Edge[]`
* [x] Keep all renderer-specific node positions and edge shapes outside the domain graph
* [x] Render the adapted collections through `StaticDiagram`
* [x] Configure the renderer as read-only: node dragging, connecting, selecting, and edge reconnection are disabled
* [x] Preserve panning and zooming for diagram inspection
* [x] Use `fitView` to frame the supplied diagram on initial render
* [x] Add focused adapter coverage for empty graphs, deterministic mapping, directional connections, and domain immutability (4 tests pass)
* [x] Verify the full test suite (31 tests), lint, and production build

## Still out of scope

* Diagram editing and renderer-to-domain commands
* Persistence or serialization
* Custom React Flow nodes
* AI integration
* Layout logic beyond the adapter's deterministic placeholder positions
