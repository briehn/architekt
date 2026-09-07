# Architekt Architecture

## Current status

The Project foundation, Domain graph foundation, Static Diagram Rendering, and Interactive Node Movement milestones are complete. The application has a framework-independent domain graph with components, directional connections, immutable graph operations, focused Vitest coverage, and a React Flow rendering path. ArchitectureEditor owns one coordinated editor-state value for the graph, renderer-only node positions, and measured dimensions, and users can drag nodes through its controlled state loop. Persistence, runtime boundary validation, custom nodes, layout logic, and AI integration have not been implemented.

## Guiding data flow

```text
User Input → Validated Command → Domain Graph → Renderer
```

The domain graph is the source of truth. `ArchitectureGraph` is converted by a React Flow adapter into renderer-specific `Node[]` and `Edge[]`, then rendered by `StaticDiagram`. Framework, UI, persistence, and AI concerns depend on the domain layer, not the reverse.

## Domain graph

`ArchitectureGraph` owns the canonical component and connection state. It is independent of React, Next.js, React Flow, persistence, and AI providers.

- Components use branded `ComponentId` values; connections use branded `ConnectionId` values. Each identifier is unique within its own entity type.
- Connections are directional: a source/target pair is distinct from its reverse pair.
- A connection is admitted only when both endpoints exist, its endpoints differ, its connection ID is unused, and no identical ordered source/target pair already exists.
- Removing a component also removes every incident connection.
- Every modifying operation returns a new graph. The graph's private Map-based state is not exposed directly, and admitted entities are stored independently from caller-owned objects.
- Predictable rule violations return typed discriminated results rather than throwing UI- or framework-specific errors.

This keeps graph behavior deterministic and testable without a browser or framework runtime.

## Rendering boundary

`toReactFlowDiagram` adapts domain components and directional connections into React Flow `Node[]` and `Edge[]`. Its deterministic placeholder positions are renderer metadata, not domain state.

ArchitectureEditor is the narrow Client Component that owns ArchitectureEditorState, which coordinates ArchitectureGraph, DiagramNodePositions, and a renderer-only map of measured node dimensions. It initializes that state once, derives React Flow Node[] and Edge[] through toReactFlowDiagram, merges current measurements into the derived nodes, and routes React Flow changes through one functional editor-state transition. The example graph remains stable across drag-triggered renders.

`DiagramNodePositions` remains the source of truth for user-authored coordinates. React Flow measurements are transient renderer metadata retained only so freshly derived controlled nodes stay initialized; they do not enter the domain graph or application layout model.

`StaticDiagram` renders the derived collections. It allows panning and zooming for inspection and uses `fitView` for initial framing. Node dragging is enabled; connecting, selecting, and edge reconnection are disabled. It does not own application graph state or translate user interactions into domain operations.

## Boundaries outside the domain layer

Runtime validation belongs at external boundaries such as forms, API requests, persisted data, imports, and AI output. Persistence, serialization, layout metadata, UI state, and AI integration remain outside the graph layer. Those concerns must translate accepted intent or data into domain operations; they must not make renderer or UI state canonical.

## Testing implications

The 27 domain Vitest tests exercise `ArchitectureGraph` through its public API. They cover accepted operations, expected rejections, immutability, and cascade removal without React, Next.js, React Flow, persistence, AI, or a browser. Adapter tests verify deterministic domain-to-renderer mapping, position translation, and renderer-measurement preservation without making React Flow state canonical.

Future tests should preserve this separation: domain tests verify graph behavior, adapter tests verify renderer mapping, and UI tests verify user interactions.
