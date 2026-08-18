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

Users model systems with components such as APIs, databases, caches, queues, load balancers, and storage. The architecture canvas is the visual focus of the workspace.

## Capabilities and Constraints

- `ArchitectureGraph` is the canonical source of truth.
- React Flow is a renderer only; it is never canonical application state.
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
