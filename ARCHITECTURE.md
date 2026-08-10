# Architekt Architecture

## Current status

The Project foundation and Domain graph foundation milestones are complete. The application has a framework-independent domain graph with components, directional connections, immutable graph operations, and focused Vitest coverage. Rendering, UI state, persistence, runtime boundary validation, and AI integration have not been implemented.

## Guiding data flow

```text
User Input → Validated Command → Domain Graph → Renderer
```

The domain graph is the source of truth. Framework, UI, persistence, and AI concerns depend on the domain layer, not the reverse.

## Domain graph

`ArchitectureGraph` owns the canonical component and connection state. It is independent of React, Next.js, React Flow, persistence, and AI providers.

- Components use branded `ComponentId` values; connections use branded `ConnectionId` values. Each identifier is unique within its own entity type.
- Connections are directional: a source/target pair is distinct from its reverse pair.
- A connection is admitted only when both endpoints exist, its endpoints differ, its connection ID is unused, and no identical ordered source/target pair already exists.
- Removing a component also removes every incident connection.
- Every modifying operation returns a new graph. The graph's private Map-based state is not exposed directly, and admitted entities are stored independently from caller-owned objects.
- Predictable rule violations return typed discriminated results rather than throwing UI- or framework-specific errors.

This keeps graph behavior deterministic and testable without a browser or framework runtime.

## Boundaries outside the domain layer

Runtime validation belongs at external boundaries such as forms, API requests, persisted data, imports, and AI output. Persistence, serialization, rendering adapters, layout metadata, UI state, and AI integration remain outside the graph layer. Those concerns must translate accepted intent or data into domain operations; they must not make renderer or UI state canonical.

## Testing implications

The 18 Vitest tests exercise `ArchitectureGraph` through its public API. They cover accepted operations, expected rejections, immutability, and cascade removal without React, Next.js, React Flow, persistence, AI, or a browser.

Future tests should preserve this separation: domain tests verify graph behavior, adapter tests verify renderer mapping, and UI tests verify user interactions.
