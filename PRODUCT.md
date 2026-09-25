# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are software engineers and aspiring software engineers practicing system design or planning a software architecture. They need to turn an idea—such as a URL shortener, chat application, or job platform—into a clear visual architecture they can inspect and discuss.

## Product Purpose

Architekt is a system-design workspace for constructing and understanding software architectures. Its current priority is the developer workspace and system-design experience, rather than a marketing site. Success means helping users produce a clear, editable diagram of a system's components and relationships.

## Positioning

Architekt treats an architecture diagram as a real domain graph rather than merely a drag-and-drop canvas. That foundation enables future validated AI assistance, system-design analysis, capacity calculations, interview practice, and intelligent architecture changes.

## Operating Context

Users model systems with Generic, Client, Service, Database, Cache, Queue, Gateway, Storage, and External service components. Directional connections can be classified as Generic, Request/response, Async messaging, Streaming, or Data access. The architecture canvas is the visual focus of the workspace.

## Capabilities and Constraints

- `ArchitectureGraph` is the canonical source of truth.
- New components are created directly from a compact, type-first picker. Each action assigns its chosen kind and a deterministic generated name such as `Service`, `Service 2`, or `Database`; users rename components later through the existing list or canvas rename flows.
- Existing component kinds are edited from the component list. The canvas shows a read-only kind icon and label; canvas double-click remains dedicated to rename.
- Generic represents migrated or intentionally unclassified components. V1 saved workspaces restore their previously untyped components as Generic.
- Component kinds classify the architecture for understanding and future analysis; they do not currently restrict connections.
- New connections begin as Generic so users are never forced to claim information they do not know. Existing connection kinds are edited immediately from compact native selects in the connection list; there is no post-create modal or canvas edge editor.
- Components offer shared connection anchors on all four sides. Attachment adapts to relative geometry, independently of canonical source-to-target direction; multiple edges may share a side.
- Native drag and two-step click/tap creation use the same canvas anchors as keyboard creation. The first activated component is the source and the second is the destination. Selecting another side of the pending source changes only the start affordance. Escape or an empty-canvas click cancels pending creation without editing the graph.
- Keyboard users Tab to one anchor per node, choose a side with arrow keys, and use Enter/Space to start or complete a connection. Focus may leave the canvas without cancelling the pending source; there is no focus trap.
- Reciprocal connections share one visual center path with an arrowhead at each end; each canonical direction retains its own semantic label and accessible description. Adaptive sides are visual only, not named ports or modeled interfaces. Manual browser, touch, and accessibility acceptance is complete; see `TODO.md`.
- Connection semantics describe the architectural relationship rather than its transport: Generic is intentionally unclassified, Request/response is a directed interaction that expects a response, Async messaging is decoupled message delivery, Streaming is an ongoing flow of values or events, and Data access is a read/write relationship with a data-holding component.
- Generic connections remain canonical, persisted, accessible, and editable but have no visible canvas label. Request/response, Async messaging, Streaming, and Data access use concise visible edge labels.
- Connection semantics classify intent without restricting valid topology. Any supported kind can describe any structurally valid directional connection, and Request/response does not imply a reverse edge.
- Protocols and arbitrary free-form connection annotations are not supported yet. They remain separate future product decisions rather than being inferred from semantic kind.
- React Flow is a renderer only; it is never canonical application state.
- Fresh diagrams begin in a deterministic left-to-right arrangement before canvas measurements exist; saved V1/V2/V3 diagrams keep their stored positions exactly.
- Auto-layout is an explicit whole-diagram action. A changed arrangement is one undo step and fits the canvas immediately; failure keeps the current workspace intact.
- Ordinary graph edits and later node measurements never rearrange the diagram automatically. Pinning, partial layout, and orientation choice are outside the current product scope.
- The domain layer remains independent of React, Next.js, React Flow, Zustand, persistence, and AI.
- React Flow-specific position and visual-style data stay outside the domain model.
- AI output must be validated before it affects the graph, and AI must never mutate React Flow state directly.
- Prefer deterministic TypeScript over AI when appropriate.
- Keep the initial scope focused; do not introduce a broad infrastructure-component catalog prematurely.
- Do not show controls for unimplemented functionality.

## Brand Commitments

Architekt should feel like a polished, professional developer tool—not a generic AI chatbot or a colorful consumer SaaS product. The product direction is modern, restrained, technical, and highly readable, with consistent tokens for color, typography, spacing, radius, and diagram elements.

## Evidence on Hand

- The implemented framework-independent graph and its invariants are documented in `ARCHITECTURE.md` and tested in `src/domain/architecture-graph.test.ts`.
- The current workspace shell and static renderer demonstration are in `src/app/page.tsx` and `src/diagram/static-diagram.tsx`.
- There are no customer testimonials, case studies, benchmarks, pricing claims, or production-use evidence; future work must not fabricate them.

## Product Principles

1. The domain graph, not the rendered canvas, defines architecture truth.
2. Preserve a clear boundary between deterministic domain behavior and framework, renderer, persistence, and AI concerns.
3. Make system-design thinking easier to inspect, discuss, and evolve visually.
4. Earn intelligent assistance through validation and deterministic operations.
5. Keep the product focused, legible, and credible at each milestone.
