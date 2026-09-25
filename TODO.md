# Architekt TODO

## Current milestone: Adaptive Multi-Side Connection Anchors

**Status: Complete.** Implementation, architecture audit, automated verification, and manual browser acceptance are complete.

### Completed

* [x] Share the finite-positive size policy and 176 x 72 fallback with Auto-Layout; preserve exact layout fixtures
* [x] Add pure deterministic dimension-aware candidate-pair geometry, including mixed sides and reciprocal reversal symmetry
* [x] Derive four shared renderer handle IDs under React Flow loose connection mode
* [x] Render reciprocal pairs on one shared center path with opposite target arrowheads and separately offset semantic labels; preserve canonical direction
* [x] Share one transient pending-source controller across click/tap and keyboard activation, alongside native drag
* [x] Add one roving anchor Tab stop per node, arrow navigation, accessible names/instructions, and shared status feedback
* [x] Verify unchanged graph invariants, V3 shape, legacy restoration, generic history, and renderer-only metadata
* [x] Audit O(nodes + edges) derivation and exercise a 100-node / 198-edge fixture without timing-sensitive thresholds
* [x] Close audit gaps: disable anchors during list-origin rename, expose disabled semantics, and stop anchor double-click from starting rename
* [x] Update architecture, product, design, and README capability documentation

### Live acceptance gate

* [x] Four restrained marks, practical hit areas, hover/focus clarity, and unchanged node dimensions
* [x] Native drag from each side: correct source/target, Generic kind, exactly one add, no trailing-click draft
* [x] Two-step click/tap from all sides; same-source switching; empty-canvas/Escape cancellation; duplicate rejection; reciprocal creation
* [x] Real Tab/Shift+Tab order, initial right side, arrow focus movement without node movement, Enter/Space completion, and no focus trap
* [x] Pointer/keyboard switching, unchanged undo/redo shortcuts, accessible names/instructions, duplicate-name disambiguation, and actual announcements
* [x] Triangle and central Service with Client/Cache/Database/Queue; fan-in/out and shared-side edges; correct arrows and readable labels
* [x] Movement across side thresholds, one drag history entry, undo/redo attachment, Auto-layout followed by manual movement
* [x] Shared reciprocal path with arrowheads at both ends and different semantic labels on opposite sides; deleting reverse restores built-in rendering
* [x] List/canvas rename disables anchors; Save/Cancel restores them; longer names remeasure without movement or extra history
* [x] Light/dark focus states, narrow canvas, short/long edges, label readability, and restrained visual density
* [x] Meaningful touch emulation or device testing without hover dependency (desktop clicks are not touch acceptance)
* [x] Pending-state behavior after focus leaves canvas; explicit Escape/canvas-click cancellation remains supported

Canvas-exit cancellation remains intentionally absent: navigation between node anchors works, and acceptance did not justify blur heuristics. The live acceptance gate is complete. No next milestone is started by this closeout.

### Deferred

Canonical named/provider/service ports, protocol/per-port validation, persisted or manually locked sides, additional same-ordered-pair edges, routing/orthogonal routing/obstacle avoidance, editable Bezier controls, label collision handling, grouped/nested boundaries, topology linting, and AI generation remain separate decisions. Existing Auto-Layout deferrals (animation, automatic/incremental layout, pinning, orientation, semantic weighting, worker execution, and viewport persistence) remain unchanged. Impeccable tooling and its stale generated sidecar remain deferred maintenance.

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
* Import/export, a general migration framework beyond the explicit V1-to-V2 compatibility path, backups, or history
* AI, Zustand, undo/redo, or collaboration

## Completed milestone: Undo/Redo

### Goal

Allow users to reverse accepted graph and layout edits without making renderer metadata historical or changing the domain graph's authority.

**Milestone status: Complete.**

### Completed tasks

* [x] Add a framework-independent ArchitectureEditorHistory module
* [x] Store only ArchitectureGraph and DiagramNodePositions in bounded past/future snapshots
* [x] Keep ReactFlowNodeMeasurements transient and reconcile them against restored graphs
* [x] Verify recording, undo/redo, redo invalidation, history limits, measurement behavior, and immutability with focused tests

* [x] Integrate history ownership into ArchitectureEditor editable view states
* [x] Record accepted component and connection edits while excluding rejected and measurement-only transitions
* [x] Coalesce each completed node drag into one history entry
* [x] Add accessible Undo and Redo controls and guarded keyboard shortcuts
* [x] Verify autosave compatibility and user-facing behavior

## Still out of scope

* Persisting undo/redo history across reloads
* Command logs, inverse commands, branching history, or a visual timeline
* Viewport, selection, form, validation, persistence-status, or renderer-measurement history
* Zustand, AI, projects, authentication, server persistence, or collaboration

## Completed milestone: Component Renaming

### Goal

Allow users to rename an architecture component directly from the editor while
preserving the graph as canonical state and relying on existing history,
persistence, and derived-rendering boundaries.

### Completed tasks

* [x] Add immutable, validated component renaming to `ArchitectureGraph`
* [x] Coordinate renames through `ArchitectureEditorState` without changing layout or transient measurements
* [x] Record changed renames through the existing undo/redo history model
* [x] Add accessible inline rename controls with save, cancel, validation, and focus restoration
* [x] Verify V1 persistence and React Flow derivation remain compatible with renamed components

## Completed milestone: Component Types

### Goal

Add a small canonical component classification that survives editing, history,
persistence, and rendering without making React Flow or presentation metadata
authoritative.

**Milestone status: Complete.**

### Completed tasks

* [x] Define the nine canonical component kinds and runtime trust-boundary guard
* [x] Require an explicit kind on every trusted in-memory component
* [x] Add immutable graph and editor-state operations for changing kind
* [x] Record changed kinds through ordinary graph history snapshots
* [x] Persist required kinds in schema V2 while restoring V1 components as Generic
* [x] Derive kind into React Flow node data without creating renderer-owned state
* [x] Add neutral canvas icons, visible kind labels, and accessible node naming
* [x] Add a direct component-type picker for creation and native kind selects for existing-component list editing
* [x] Preserve rename, focus, layout, connection, autosave, and undo/redo behavior
* [x] Verify the milestone across domain, editor, history, persistence, renderer, and UI boundaries

## Completed milestone: Connection Semantics

### Goal

Add a small provider-independent semantic classification to directional connections
without forcing protocol details, restricting valid topology, or making React Flow
canonical.

**Milestone status: Complete.**

### Completed tasks

* [x] Define the five canonical connection kinds and runtime trust-boundary guard
* [x] Require an explicit kind on every trusted in-memory connection
* [x] Add immutable graph and editor-state operations for changing connection kind
* [x] Record changed connection kinds through ordinary graph history snapshots
* [x] Persist required connection kinds in schema V3 while restoring V1/V2 connections as Generic
* [x] Derive connection kind into React Flow edge data without creating renderer-owned state
* [x] Add neutral non-Generic edge labels and accessible semantic descriptions
* [x] Add compact native connection-list selects with runtime DOM-value narrowing
* [x] Seed the fresh API to Database example as Data access while keeping drag creation Generic
* [x] Preserve topology, direction, layout, measurements, autosave, undo/redo, and legacy restoration behavior
* [x] Verify the milestone across domain, editor state, history, persistence, renderer, UI, and accessibility boundaries

### Deliberately deferred

* Protocol or transport fields and arbitrary free-form connection annotations
* Canvas edge selection, direct edge editing, context menus, and inspectors/properties panels
* Ports, per-port connection rules, bandwidth, traffic, latency, and capacity metadata
* Semantic colors, icons, animation, line patterns, or provider-specific connection styling
* Architecture linting, kind-based topology restrictions, and automated semantic analysis
* Grouped boundaries, AI generation, collaboration, and server persistence


## Completed milestone: Auto-Layout

### Goal

Arrange fresh architecture diagrams deterministically and let users explicitly rearrange a whole existing diagram without changing graph semantics, persistence format, or renderer state ownership.

**Milestone status: Complete.**

### Completed tasks

* [x] Isolate synchronous left-to-right Dagre layout behind a framework-independent graph-and-sizes to positions API
* [x] Use valid transient node sizes or deterministic fallback dimensions; support disconnected components, isolated nodes, cycles, and bidirectional connections
* [x] Normalize and integer-round stable results without mutating the canonical graph or consuming custom edge routes
* [x] Arrange fresh examples before rendering, preserve loaded positions, and retain deterministic row placement only if fresh layout fails
* [x] Expose one accessible whole-diagram Auto-layout action with disabled states, status feedback, and failure preservation
* [x] Record changed layouts through generic history as one undo step; preserve history and redo for exact no-ops and failures
* [x] Fit only changed explicit layouts through a transient renderer request with no animation or viewport persistence
* [x] Align the single target/source handles left/right while keeping canonical connection direction and rename disabling
* [x] Verify the layout, editor-state, history, persistence, renderer, and action boundaries with focused and full automated tests

### Deferred follow-ups

* Layout animation and automatic layout after ordinary edits
* Node pinning and partial or incremental layout
* Orientation controls and semantic edge weighting
* Label collision avoidance and custom or orthogonal edge routing
* Ports and grouped or nested layout
* Worker execution and viewport persistence
* AI generation, which must produce validated graph changes before layout

## Future milestone candidates

* Keep canvas kind presentation read-only unless a later product decision changes the established list-editing interaction
* Consider richer component metadata, provider-specific technologies, or an inspector only when a concrete workflow requires them
* Design semantic connection analysis or validation separately; component and connection kinds currently classify the graph without restricting topology
* Treat future AI-generated architectures as untrusted proposals whose component and connection kinds must pass the same runtime validation and domain operations
