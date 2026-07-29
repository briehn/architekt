# Architekt Architecture

## Current status

The Project foundation milestone is complete. The implemented application is a static Next.js App Router shell with global styling and product metadata. No domain graph, command pipeline, renderer, state-management system, persistence, authentication, collaboration, or AI integration exists yet.

This document records the architectural boundaries already agreed for future milestones. It does not prescribe detailed designs for features that have not been built.

## Guiding data flow

```text
User Input → Validated Command → Domain Graph → Renderer
```

The flow establishes one controlled path from external intent to visible output:

1. Input is treated as untrusted at the system boundary.
2. Structurally valid commands express requested domain operations.
3. The domain graph determines whether those operations are valid for the current state, enforces its invariants, and remains the source of truth.
4. A renderer or adapter converts domain state into a UI-specific representation.

This pipeline is an architectural direction, not a description of currently implemented functionality.

## Dependency rule

The domain graph must remain independent from React Flow, Next.js, persistence technology, and AI providers. Domain code must not import their types or shape its entities around their APIs.

Framework, rendering, storage, and AI integrations depend on the domain boundary—not the reverse. This prevents UI state from becoming canonical business state, keeps domain behavior portable and testable, and allows infrastructure choices to change without rewriting the model.

## Intended responsibilities

| Boundary | Responsibility | Current status |
| --- | --- | --- |
| Input and commands | Accept user or external input, validate its runtime shape, and translate permitted intent into explicit domain operations. Malformed input must not reach the domain layer, while the domain layer remains responsible for enforcing its own invariants. | Planned |
| Domain layer | Own the canonical graph, enforce invariants, and provide operations that change graph state. It must remain framework-independent. | Planned |
| Renderer and adapter | Transform the domain graph into the representation required by the chosen visual renderer. Renderer-specific nodes and edges must remain derived state. | Planned |
| UI layer | Present the application, collect user intent, report errors, and invoke application boundaries. The UI must not bypass commands to mutate renderer state as canonical state. | Minimal static shell implemented |
| Persistence layer | Eventually load and save domain-level data through an explicit boundary. Storage models must not dictate the domain model. | Not designed or implemented |
| AI layer | Eventually treat model output as untrusted input, validate it, and translate accepted output into the same command path used by other inputs. AI must not mutate domain or renderer state directly. | Not designed or implemented |

## Deterministic behavior

Calculations, validation rules, layout inputs, and graph transformations should use deterministic TypeScript whenever practical. Deterministic code is repeatable, inexpensive to execute, straightforward to review, and easier to test than probabilistic output.

AI may eventually help interpret ambiguous human intent, but it should not replace algorithms for behavior the application can calculate reliably. The same input and state should produce the same transformation unless nondeterminism is an explicit product requirement.

## Current decisions and tradeoffs

- **One canonical graph:** Avoiding separate domain and renderer sources of truth prevents synchronization ambiguity, at the cost of maintaining an adapter.
- **Framework-independent domain:** This improves testability and reduces vendor coupling, while requiring deliberate boundary mapping.
- **Runtime validation at entry points:** TypeScript types alone cannot validate forms, imported files, persisted data, API requests, or AI output. The validation mechanism has not been selected.
- **Dependencies are deferred:** React Flow, state management, validation, and infrastructure libraries will be introduced only when a current milestone demonstrates a concrete need.
- **Static foundation first:** The present UI remains small and non-interactive so domain and state decisions are not hidden inside starter UI code.

## Explicit non-decisions

The following details have intentionally not been designed or selected:

- Final node, edge, graph, or command interfaces
- Domain invariants and supported graph operations
- Source layout and module boundaries beyond the files that currently exist
- State-management and runtime-validation libraries
- Renderer integration details, adapter types, and layout algorithms
- Persistence technology, database schema, serialization format, and migration strategy
- Authentication and authorization design
- Collaboration, conflict resolution, version history, and undo/redo behavior
- AI provider, model, prompts, tool-calling strategy, and evaluation approach

These decisions should be made in the milestone that first needs them, using concrete requirements rather than speculative extensibility.

## Testing implications

Domain behavior should eventually be testable with plain TypeScript, without Next.js, React, React Flow, a database, or a browser. Tests should prioritize domain invariants, command validation, graph transformations, and deterministic calculations. Adapter tests should verify mapping at the renderer boundary, while UI tests should focus on critical user interactions rather than domain rules.

The current static shell is validated through linting, TypeScript compilation, production builds, and focused visual checks when browser tooling is available.

## Recording future decisions

Update this document whenever a change affects boundaries, state ownership, data flow, validation, rendering, persistence, or AI integration. Record the decision, its context, meaningful alternatives, and its tradeoffs; clearly distinguish adopted architecture from planned or rejected options.

If decisions become numerous or require durable individual history, introduce lightweight architecture decision records at that time rather than creating process infrastructure prematurely.
