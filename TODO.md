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

## Completed milestone: Interactive Node Movement

### Goal

Introduce the narrow client-side state boundary needed to translate future React Flow node-position changes into renderer metadata without making React Flow canonical.

**Milestone status: Complete.**

### Completed tasks

* [x] Keep renderer-specific node positions in `DiagramNodePositions`, outside the domain graph
* [x] Translate recognized React Flow position changes through a deterministic adapter
* [x] Add `ArchitectureEditor` as the Client Component that owns position state
* [x] Initialize positions once and derive React Flow nodes and edges from graph plus positions
* [x] Keep the example `ArchitectureGraph` stable across position-triggered renders
* [x] Wire `onNodesChange` through a functional React state update
* [x] Enable node dragging in React Flow while preserving the controlled position-state loop
* [x] Preserve measured node dimensions as renderer-only metadata across controlled position updates
## Completed milestone: Component Creation and Deletion

### Goal

Allow users to deliberately create and delete architecture components while preserving ArchitectureGraph as canonical structure, DiagramNodePositions as canonical layout, and React Flow as a controlled derived renderer.

**Milestone status: Complete.**

### Completed tasks

* [x] Reject blank component names as a domain invariant
* [x] Add immutable layout helpers for new and removed component positions
* [x] Add immutable cleanup for renderer-only node measurements
* [x] Coordinate graph, layout, and renderer metadata through pure ArchitectureEditorState operations
* [x] Keep React Flow structural add/remove changes from mutating the domain graph
* [x] Refactor ArchitectureEditor to own one coordinated editor-state value
* [x] Add a compact form and component list with explicit delete actions
* [x] Generate component IDs at the UI boundary and submit accepted input through editor-state operations
* [x] Preserve node dragging while connecting, selection, and edge reconnection remain disabled
* [x] Verify domain, layout, adapter, and editor-state behavior through focused Vitest coverage

## Still out of scope

* Connection creation or deletion through the UI
* Node selection, keyboard deletion, renaming, or custom nodes
* Persistence, undo/redo, collaboration, authentication, or AI integration
* Automatic layout, collision avoidance, or viewport-aware placement

## Completed milestone: Connection Creation

### Goal

Allow users to create directional architecture connections through React Flow while preserving ArchitectureGraph as canonical connection state and keeping renderer gestures at the application boundary.

**Milestone status: Complete.**

### Completed tasks

* [x] Translate React Flow Connection payloads into ArchitectureConnection values
* [x] Generate ConnectionId values at the UI boundary
* [x] Add connections through a pure ArchitectureEditorState operation
* [x] Delegate connection invariants and rejection types to ArchitectureGraph
* [x] Synchronize the authoritative latest-state transition with concise rejection feedback
* [x] Derive rendered edges from the accepted domain graph
* [x] Enable strict source-to-target connection gestures while preserving node dragging
* [x] Keep selection and edge reconnection disabled
* [x] Verify translation, accepted connections, rejected connections, reference preservation, and derived edges through focused Vitest coverage

## Still out of scope

* Connection deletion or edge reconnection
* Node or edge selection and keyboard deletion
* Custom nodes, handles, ports, connection labels, or connection types
* Persistence, undo/redo, collaboration, authentication, or AI integration
* Zustand or renderer-owned canonical edge state

## Completed milestone: Connection Deletion

### Goal

Allow users to deliberately delete existing architecture connections without making React Flow canonical or introducing canvas selection.

**Milestone status: Complete.**

### Completed tasks

* [x] Add connection removal through a pure ArchitectureEditorState operation
* [x] Delegate unknown-ID rejection, immutability, and removal semantics to ArchitectureGraph
* [x] Preserve DiagramNodePositions and ReactFlowNodeMeasurements by reference
* [x] Add a compact connection list with directional endpoint names and explicit delete actions
* [x] Disambiguate duplicate visible endpoint-name pairs with existing full endpoint IDs only where needed
* [x] Keep React Flow selection, structural edge changes, and edge reconnection disabled
* [x] Verify successful deletion, rejection, preservation behavior, and derived edges through focused Vitest coverage

## Still out of scope

* Node or edge selection and keyboard deletion
* Edge reconnection, custom edges, inline edge controls, or context menus
* Connection labels, types, ports, or display-specific identifiers
* Persistence, undo/redo, collaboration, authentication, or AI integration
* Zustand or renderer-owned canonical edge state

## Completed milestone: Persistence

### Goal

Preserve the current single-workspace graph and node positions across refreshes without making persisted or renderer data canonical and without bypassing domain invariants during restoration.

**Milestone status: Complete.**

### Completed tasks

* [x] Define a plain, explicitly versioned V1 editor-document schema
* [x] Serialize graph components, graph connections, and DiagramNodePositions without renderer measurements
* [x] Runtime-validate persisted `unknown` data at the codec seam
* [x] Restore ArchitectureGraph exclusively through `empty`, `addComponent`, and `addConnection`
* [x] Reject invalid graphs and incomplete, duplicate, orphaned, or non-finite node positions atomically
* [x] Restore ReactFlowNodeMeasurements as empty transient state
* [x] Verify serialization, restoration, invariant enforcement, round trips, and immutability with focused tests
* [x] Add a typed localStorage adapter around the pure codec with injected storage
* [x] Handle missing data, invalid saved state, unsupported versions, and unavailable storage without duplicating domain validation
* [x] Verify load, save, clear, failure mapping, single-write behavior, and adapter round trips with a browser-free fake
* [x] Add a stable server/client loading state and load local persistence after mount
* [x] Resolve loaded, missing, recovery-required, and memory-only editor modes without mounting React Flow early
* [x] Keep the example workspace editable in recovery and memory-only modes while preserving invalid saved data
* [x] Preserve functional graph, position, and measurement updates across every editable persistence mode
* [x] Verify that server rendering emits only the loading shell

### Remaining tasks

* [x] Add 300 ms trailing-debounced automatic saving for graph and position changes
* [x] Keep failed saves editable and support explicit Retry plus automatic retry after a later persistable edit
* [x] Add clear-first saved-workspace reset and recovery actions
* [x] Verify persistence and recovery through browser-level checks

## Still out of scope

* IndexedDB, a server or database, authentication, projects, or multi-user infrastructure
* Cross-device synchronization or cross-tab conflict resolution
* React Flow nodes, edges, measurements, viewport, or transient UI-state persistence
* Import/export, migration machinery beyond rejecting unsupported versions, backups, or history
* AI, Zustand, undo/redo, or collaboration

## Current milestone: Undo/Redo

### Goal

Allow users to reverse accepted graph and layout edits without making renderer metadata historical or changing the domain graph's authority.

**Milestone status: In progress.**

### Completed tasks

* [x] Add a framework-independent ArchitectureEditorHistory module
* [x] Store only ArchitectureGraph and DiagramNodePositions in bounded past/future snapshots
* [x] Keep ReactFlowNodeMeasurements transient and reconcile them against restored graphs
* [x] Verify recording, undo/redo, redo invalidation, history limits, measurement behavior, and immutability with focused tests

### Remaining tasks

* [x] Integrate history ownership into ArchitectureEditor editable view states
* [ ] Record accepted component and connection edits while excluding rejected and measurement-only transitions
* [ ] Coalesce each completed node drag into one history entry
* [ ] Add accessible Undo and Redo controls and guarded keyboard shortcuts
* [ ] Verify autosave compatibility and user-facing behavior

## Still out of scope

* Persisting undo/redo history across reloads
* Command logs, inverse commands, branching history, or a visual timeline
* Viewport, selection, form, validation, persistence-status, or renderer-measurement history
* Zustand, AI, projects, authentication, server persistence, or collaboration
