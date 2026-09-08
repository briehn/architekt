# Architekt Architecture

## Current status

The Project foundation, Domain graph foundation, Static Diagram Rendering, Interactive Node Movement, Component Creation and Deletion, Connection Creation, and Connection Deletion milestones are complete. The application has a framework-independent domain graph with components, directional connections, immutable graph operations, focused Vitest coverage, and a React Flow rendering path. ArchitectureEditor owns coordinated graph, layout, renderer metadata, and connection-feedback state, and users can drag nodes and create validated directional connections through its controlled state loop. Users can also create and delete components and deliberately delete existing connections through a compact editor control region. The persistence milestone is in progress: a pure V1 editor-document codec and localStorage adapter are implemented, and ArchitectureEditor now loads the saved workspace after mount. Autosave, save retry, and reset recovery actions are not yet implemented. Custom nodes, layout logic, and AI integration have not been implemented.

## Guiding data flow

```text
User Input → Validated Command → Domain Graph → Renderer
```

The domain graph is the source of truth. `ArchitectureGraph` is converted by a React Flow adapter into renderer-specific `Node[]` and `Edge[]`, then rendered by `StaticDiagram`. Framework, UI, persistence, and AI concerns depend on the domain layer, not the reverse.

## Domain graph

`ArchitectureGraph` owns the canonical component and connection state. It is independent of React, Next.js, React Flow, persistence, and AI providers.

- Components use branded `ComponentId` values; connections use branded `ConnectionId` values. Each identifier is unique within its own entity type.
- Component names must contain at least one non-whitespace character.
- Connections are directional: a source/target pair is distinct from its reverse pair.
- A connection is admitted only when both endpoints exist, its endpoints differ, its connection ID is unused, and no identical ordered source/target pair already exists.
- Removing a component also removes every incident connection.
- Every modifying operation returns a new graph. The graph's private Map-based state is not exposed directly, and admitted entities are stored independently from caller-owned objects.
- Predictable rule violations return typed discriminated results rather than throwing UI- or framework-specific errors.

This keeps graph behavior deterministic and testable without a browser or framework runtime.

## Rendering boundary

`toReactFlowDiagram` adapts domain components and directional connections into React Flow `Node[]` and `Edge[]`. Its deterministic placeholder positions are renderer metadata, not domain state.

ArchitectureEditor is the narrow Client Component that owns ArchitectureEditorState, which coordinates ArchitectureGraph, DiagramNodePositions, and a renderer-only map of measured node dimensions. It initializes that state once, derives React Flow Node[] and Edge[] through toReactFlowDiagram, merges current measurements into the derived nodes, and routes React Flow changes through one functional editor-state transition. The example graph remains stable across drag-triggered renders.

Its compact control region creates ComponentId values with crypto.randomUUID() at the UI boundary, trims form input, and submits accepted component additions and deletions through pure editor-state operations. React Flow connection gestures are translated into ArchitectureConnection values with application-generated ConnectionId values, then admitted through the same editor-state and domain-graph path. Existing connections are listed from the canonical graph by directional endpoint names and removed through a pure editor-state operation; React Flow receives only the newly derived edge collection. Connection rejection feedback is calculated together with the authoritative latest-state transition in one functional React update. React Flow selection and edge reconnection remain disabled.

`DiagramNodePositions` remains the source of truth for user-authored coordinates. React Flow measurements are transient renderer metadata retained only so freshly derived controlled nodes stay initialized; they do not enter the domain graph or application layout model.

`StaticDiagram` renders the derived collections. It allows panning and zooming for inspection and uses `fitView` for initial framing. Node dragging and strict source-to-target connection gestures are enabled; selection and edge reconnection are disabled. It reports connection intent to ArchitectureEditor and does not own or directly add canonical edges.

## Boundaries outside the domain layer

Runtime validation belongs at external boundaries such as forms, API requests, persisted data, imports, and AI output. Persistence, serialization, layout metadata, UI state, and AI integration remain outside the graph layer. Those concerns must translate accepted intent or data into domain operations; they must not make renderer or UI state canonical.

## Persistence codec seam

The V1 persisted editor document is plain serializable data containing only a schema version, graph components, graph connections, and diagram node positions. It contains no Maps, class instances, React Flow nodes or edges, renderer measurements, viewport state, or transient UI state.

The pure codec is the trust seam between untrusted persisted `unknown` data and branded editor/domain data. Restoration validates the document structure and finite coordinates, converts string identifiers to branded values only inside the codec, and reconstructs ArchitectureGraph by replaying `addComponent` and `addConnection` from `ArchitectureGraph.empty()`. Existing graph operations therefore remain authoritative for component and connection invariants. Restoration rejects the whole document if the graph is invalid or if positions are duplicated, missing, or orphaned, and always initializes renderer measurements as empty.

Serialization emits fresh plain objects and may retain graph getter order for deterministic codec output. That order is a representation detail, not an ArchitectureGraph invariant. The codec is framework-independent and has no browser-storage responsibility.

The concrete localStorage adapter owns the single `architekt:architecture-editor` key, JSON parsing and stringification, and storage exception mapping. Its three operations accept a structural `StorageLike` dependency containing only `getItem`, `setItem`, and `removeItem`, so tests use a browser-free fake and future editor integration can pass `window.localStorage` explicitly. Loads distinguish missing data, unsupported versions, invalid saved state, and unavailable storage. Saves serialize the complete document before making one write and distinguish invalid editor state from unavailable storage. The adapter delegates all document, graph, and position validation to the codec rather than duplicating those rules.

This adapter is deliberately concrete instead of implementing a generic persistence repository. The application currently has one local workspace and one storage mechanism; project identity, server revisions, authentication, conflict handling, and asynchronous persistence semantics do not exist yet. The pure codec remains the reusable seam for a later server adapter without forcing those unknown requirements into today’s interface.

ArchitectureEditor starts from a stable loading view during server rendering and the first client render, then reads local storage from a mount effect. React Flow is not mounted until that read resolves, so restored positions are the first positions the diagram receives and the example workspace does not flash before hydration. A discriminated view-state model distinguishes ready, recovery-required, and memory-only modes. Missing data selects a fresh example editor state; invalid or unsupported data remains preserved while an editable unsaved example is shown; unavailable storage produces an editable memory-only workspace. All modes continue to route edits through the same pure ArchitectureEditorState operations. Saving and recovery actions remain deferred.

## Testing implications

Domain Vitest tests exercise `ArchitectureGraph` through its public interface. They cover accepted operations, expected rejections, immutability, and removal behavior without React, Next.js, React Flow, persistence, AI, or a browser. Adapter and editor-state tests verify deterministic domain-to-renderer mapping, position translation, renderer-measurement preservation, coordinated connection removal, and derived-edge updates without making React Flow state canonical. Persistence-codec tests verify runtime validation, graph replay, exact position coverage, deterministic serialization, and input immutability. Local-storage adapter tests use an injected fake to verify storage calls and failures without `window` or a browser. A server-render test verifies that ArchitectureEditor emits only its stable loading shell before browser storage can be read.

Future tests should preserve this separation: domain tests verify graph behavior, adapter tests verify renderer mapping, and UI tests verify user interactions.
