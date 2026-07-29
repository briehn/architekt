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

## Current milestone: Domain graph foundation

### Goal

Establish the smallest useful framework-independent domain graph: architecture components, connections between them, explicit invariants, and deterministic operations verified by meaningful tests.

The domain graph must remain independent from React, Next.js, React Flow, Zustand, persistence, and AI concerns.

### Tasks

* [ ] Define a minimal architecture component with stable identity and a human-readable name
* [ ] Define a minimal connection between two architecture components, including only the identity needed by supported operations
* [ ] Define a graph aggregate that owns its components and connections as canonical domain state
* [ ] Decide and document the initial graph invariants:
  * component and connection identifier uniqueness
  * endpoint validity
  * duplicate-connection policy
  * self-connection policy
  * component-removal behavior
* [ ] Decide how domain operations report predictable success and rejection outcomes without coupling behavior to a UI or framework
* [ ] Implement the smallest deterministic operation set needed to create and modify the graph while preserving the adopted invariants
* [ ] Add the minimal test setup and project script needed to run domain tests
* [ ] Test meaningful success and failure behavior through the domain model’s public API, including invariant enforcement and removal effects
* [ ] Update `ARCHITECTURE.md` with the domain decisions actually adopted during the milestone
* [ ] Verify tests, lint, production build, and framework independence

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
