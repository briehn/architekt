# Architekt Architecture

## Current status

The Project foundation, Domain graph foundation, Static Diagram Rendering, Interactive Node Movement, Component Creation and Deletion, Connection Creation, Connection Deletion, Persistence, Undo/Redo, Component Renaming, and Component Types milestones are complete. The application has a framework-independent domain graph with typed components, directional connections, immutable graph operations, focused Vitest coverage, and a React Flow rendering path. ArchitectureEditor owns coordinated graph, layout, renderer metadata, history, and connection-feedback state. Users can create, delete, rename, and classify components; drag nodes; create and delete directional connections; persist the current graph and layout locally; and undo or redo accepted edits. Automatic layout and AI integration have not been implemented.

## Guiding data flow

```text
User Input → Validated Command → Domain Graph → Renderer
```

The domain graph is the source of truth. `ArchitectureGraph` is converted by a React Flow adapter into renderer-specific `Node[]` and `Edge[]`, then rendered by `StaticDiagram`. Framework, UI, persistence, and AI concerns depend on the domain layer, not the reverse.

## Domain graph

`ArchitectureGraph` owns the canonical component and connection state. It is independent of React, Next.js, React Flow, persistence, and AI providers.

- Components use branded `ComponentId` values; connections use branded `ConnectionId` values. Each identifier is unique within its own entity type.
- Every trusted in-memory `ArchitectureComponent` has a required `kind`. The canonical vocabulary is exactly `generic`, `client`, `service`, `database`, `cache`, `queue`, `gateway`, `storage`, and `external-service`; the domain does not supply a default.
- `isArchitectureComponentKind` validates unknown values at external trust boundaries. Typed domain operations accept only `ArchitectureComponentKind`, so they do not repeat runtime validation for arbitrary strings.
- Component names must contain at least one non-whitespace character.
- `renameComponent` validates component existence before name validity, preserves every valid name exactly as supplied, permits duplicate visible names, and replaces only the renamed component in a new graph. Exact same-string renames preserve the original graph reference; rejected renames do not change it.
- `changeComponentKind` returns a typed unknown-component rejection, preserves names, IDs, connections, and unrelated components, and replaces only the targeted component for a real change. An exact same-kind request returns the original graph reference.
- Connections are directional: a source/target pair is distinct from its reverse pair.
- A connection is admitted only when both endpoints exist, its endpoints differ, its connection ID is unused, and no identical ordered source/target pair already exists.
- Removing a component also removes every incident connection.
- Every real modification returns a new graph; intentional exact no-ops preserve graph identity. The graph's private Map-based state is not exposed directly, and admitted entities are stored independently from caller-owned objects.
- Predictable rule violations return typed discriminated results rather than throwing UI- or framework-specific errors.

Kinds are classification-only. They do not restrict, warn about, or otherwise change connection semantics. This keeps graph behavior deterministic and testable without a browser or framework runtime.

## Rendering boundary

`toReactFlowDiagram` adapts domain components and directional connections into React Flow `Node[]` and `Edge[]`. Each derived node copies the canonical component ID, name, and kind into its node data. Its deterministic placeholder positions and all React Flow node data are renderer representations, not domain state.

The component-kind flow is intentionally one-way:

```text
ArchitectureGraph.kind
→ React Flow node.data.kind
→ presentation label and icon
```

React Flow never owns or directly edits kind. The presentation layer owns the exhaustive mapping from canonical kinds to human-readable labels and Lucide icons; labels and icons do not belong in the domain model.

ArchitectureEditor is the narrow Client Component that owns ArchitectureEditorState, which coordinates ArchitectureGraph, DiagramNodePositions, and a renderer-only map of measured node dimensions. It initializes that state once, derives React Flow Node[] and Edge[] through toReactFlowDiagram, merges current measurements into the derived nodes, and routes React Flow changes through one functional editor-state transition. The example graph remains stable across drag-triggered renders.

Its compact control region creates ComponentId values with crypto.randomUUID() at the UI boundary, trims form input, and submits accepted component additions, deletions, renames, and kind changes through pure editor-state operations. The creation form keeps its selected kind as transient UI state, starts at the UI-only `service` default, and retains the last successfully used kind. Existing kinds are edited immediately through native selects in component-list rows. Both selects narrow raw DOM strings with `isArchitectureComponentKind` before calling typed operations. Inline rename drafts, validation feedback, creation drafts, and focus state remain local UI state; they never enter the graph, editor state, history, or persistence.

`renameComponentInEditorState` and `changeComponentKindInEditorState` delegate validation and mutation to the graph, preserve node-position and measurement references for real semantic changes, and preserve the complete editor-state reference for exact no-ops. A list kind change cancels any active list or canvas rename draft without recording the cancellation; it preserves focus on the select, while ordinary rename Cancel and Escape continue restoring focus to the rename trigger. Canvas double-click remains rename-only, and the canvas icon and label remain read-only presentation.

React Flow connection gestures are translated into ArchitectureConnection values with application-generated ConnectionId values, then admitted through the same editor-state and domain-graph path. Existing connections are listed from the canonical graph by directional endpoint names and removed through a pure editor-state operation; duplicate visible endpoint pairs receive technical-ID disambiguation only while ambiguous. React Flow nodes and connection rows therefore reflect current graph names and kinds without renderer-owned edit state. Connection rejection feedback is calculated together with the authoritative latest-state transition in one functional React update. React Flow selection and edge reconnection remain disabled.

`DiagramNodePositions` remains the source of truth for user-authored coordinates. React Flow measurements are transient renderer metadata retained only so freshly derived controlled nodes stay initialized; they do not enter the domain graph or application layout model.

`StaticDiagram` renders the derived collections. It allows panning and zooming for inspection and uses `fitView` for initial framing. Node dragging and strict source-to-target connection gestures are enabled; selection and edge reconnection are disabled. It reports connection intent to ArchitectureEditor and does not own or directly add canonical edges.

## Boundaries outside the domain layer

Runtime validation belongs at external boundaries such as forms, API requests, persisted data, imports, and AI output. Persistence, serialization, layout metadata, UI state, and AI integration remain outside the graph layer. Those concerns must translate accepted intent or data into domain operations; they must not make renderer or UI state canonical.

## Persistence codec seam

The persisted editor document is plain serializable data containing only a schema version, graph components, graph connections, and diagram node positions. V2 is the current write format and requires every persisted component to contain `id`, `name`, and `kind`. V1 remains a read-only compatibility format whose components contain only `id` and `name`. Documents contain no Maps, class instances, React Flow nodes or edges, renderer measurements, viewport state, or transient UI state.

The pure codec is the trust seam between untrusted persisted `unknown` data and branded editor/domain data. V2 restoration requires `kind` and validates it with `isArchitectureComponentKind`; missing, non-string, or unsupported kind values make the document invalid and never fall back to `generic`. V1 restoration follows one explicit compatibility path that assigns `generic` without inferring classification from names. Restoration then converts string identifiers to branded values only inside the codec and reconstructs ArchitectureGraph by replaying `addComponent` and `addConnection` from `ArchitectureGraph.empty()`. Existing graph operations therefore remain authoritative for component and connection invariants. Restoration rejects the whole document if the graph is invalid or if positions are duplicated, missing, or orphaned, and always initializes renderer measurements as empty.

Serialization emits fresh plain objects and may retain graph getter order for deterministic codec output. That order is a representation detail, not an ArchitectureGraph invariant. The codec is framework-independent and has no browser-storage responsibility.

The concrete localStorage adapter owns the single `architekt:architecture-editor` key, JSON parsing and stringification, and storage exception mapping. Its three operations accept a structural `StorageLike` dependency containing only `getItem`, `setItem`, and `removeItem`, so tests use a browser-free fake and future editor integration can pass `window.localStorage` explicitly. Loads distinguish missing data, unsupported versions, invalid saved state, and unavailable storage. Saves serialize the complete document before making one write and distinguish invalid editor state from unavailable storage. The adapter delegates all document, graph, and position validation to the codec rather than duplicating those rules.

This adapter is deliberately concrete instead of implementing a generic persistence repository. The application currently has one local workspace and one storage mechanism; project identity, server revisions, authentication, conflict handling, and asynchronous persistence semantics do not exist yet. The pure codec remains the reusable seam for a later server adapter without forcing those unknown requirements into today’s interface.

ArchitectureEditor starts from a stable loading view during server rendering and the first client render, then reads local storage from a mount effect. React Flow is not mounted until that read resolves, so restored positions are the first positions the diagram receives and the example workspace does not flash before hydration. A discriminated view-state model distinguishes ready, recovery-required, and memory-only modes. Missing data selects a fresh example editor state; invalid and unsupported data remain preserved while an editable unsaved example is shown; unavailable storage produces an editable memory-only workspace. All modes continue to route edits through the same pure ArchitectureEditorState operations.

Only ready mode participates in autosave. It retains the injected storage instance and tracks the graph and node-position references from the last successfully persisted revision. Loaded and missing workspaces initialize that baseline so hydration does not immediately rewrite storage. Consequently, loading V1 restores in-memory Generic components without manufacturing a user edit or migration write; the next ordinary graph or position change serializes the full state as V2 through the unchanged storage key. A graph or position reference change schedules one trailing save after 300 ms; a newer persistable edit cancels and replaces that timer. Renderer-measurement changes are absent from the effect dependencies and therefore neither schedule nor delay persistence. Failed writes leave the baseline and in-memory editor state unchanged, show a concise unsaved warning, and can be retried immediately or by making a later persistable edit. Recovery-required and memory-only modes never autosave.

Recovery distinguishes corrupt data from an unsupported saved version without exposing technical details. An explicit, native-confirmed reset is the only operation authorized to discard saved recovery data. It calls the adapter's clear operation before changing editor state. If clearing fails, both the persisted value and editable recovery workspace remain intact with a retryable failure message. After a successful clear, the editor creates a deterministic example state with empty measurements, clears transient form and rejection feedback, establishes the new graph and position references as the baseline, and moves to ready mode. The baseline avoids immediately recreating the just-cleared storage entry; a subsequent graph or position edit resumes normal autosave.

## Editor history seam

ArchitectureEditorHistory is a framework-independent wrapper around ArchitectureEditorState. Its present value contains the full coordinated editor state, while bounded past and future snapshots contain only ArchitectureGraph and DiagramNodePositions. Accepted graph or position reference changes create history entries; measurement-only changes update present without recording or clearing redo. Complete no-ops preserve the existing history reference.

Undo and redo restore graph and position snapshots while treating ReactFlowNodeMeasurements as a transient cache. Measurements are never stored in snapshots. Restoration retains current measurements only for component IDs present in the restored graph, and components without retained measurements are left for React Flow to measure again. The history retains at most 100 past snapshots and is not serialized. Each editable ArchitectureEditor persistence mode owns a history wrapper and reads the active editor state from its present value. Accepted component and connection operations, including changed names and kinds, record a new present value; rejected operations and exact no-ops leave history and redo intact. Kind changes need no special history machinery because ordinary graph snapshots naturally restore prior component names and kinds during undo and redo.

Node dragging is modeled as a short transaction. ArchitectureEditor captures the history at drag start, applies every live React Flow position or measurement change through non-recording replacement, then asks the pure history module to commit at drag stop. The commit compares canonical position contents with the pre-drag positions, records exactly one transition for a real move, and preserves history and redo when the node returns to its original position. It also rejects a stale transaction if the history stacks or graph changed during the drag.

Visible Undo and Redo buttons and guarded keyboard shortcuts share one ArchitectureEditor navigation path. The path rechecks availability through the history module inside a functional view-state update, preserves the active persistence mode and transient feedback, and refuses navigation during loading or an active drag transaction. The single keydown listener reads the latest committed view state through a synchronized ref rather than capturing the initial history. It recognizes Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y, ignores Alt-modified events and editable targets, and prevents the browser default only when an editor history action is available. Undo and redo require no persistence-specific behavior: ready-mode graph or position changes enter the existing autosave flow, while recovery-required and memory-only modes remain unsaved.

## Testing implications

Domain Vitest tests exercise `ArchitectureGraph` through its public interface. They cover accepted operations, expected rejections, kind vocabulary, immutability, and removal behavior without React, Next.js, React Flow, persistence, AI, or a browser. Adapter and editor-state tests verify deterministic domain-to-renderer mapping, kind derivation, position translation, renderer-measurement preservation, coordinated connection removal, and derived-edge updates without making React Flow state canonical. Persistence-codec tests verify V1 compatibility, V2 runtime validation, graph replay, exact position coverage, deterministic serialization, and input immutability. Local-storage adapter tests use an injected fake to verify storage calls and failures without `window` or a browser. History tests exercise accepted graph and position transitions, kind undo/redo, measurement reconciliation, bounded storage, and immutability through the pure history interface. Presentation and editor tests protect the exhaustive kind mapping, accessible node output, native select boundaries, and creation/list-edit coordination. Keyboard-shortcut tests cover supported modifiers and editable-target suppression without a browser dependency. A server-render test verifies that ArchitectureEditor emits only its stable loading shell before browser storage can be read.

Future tests should preserve this separation: domain tests verify graph behavior, adapter tests verify renderer mapping, and UI tests verify user interactions.
