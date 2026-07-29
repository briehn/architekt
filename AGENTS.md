<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Architekt Agent Instructions

## Project purpose

Architekt is an AI-powered system-design application. Users will eventually be able to describe a software system and receive a clean, editable architecture diagram.

This is a flagship portfolio project. Optimize decisions for:

1. Software engineering best practices
2. Clear interview discussion value
3. Recruiter appeal
4. Maintainability
5. Developer learning

Treat this repository like a real product, not a tutorial project.

## Working style

The repository owner is learning and should implement important business logic himself.

Before changing architecture or core business logic:

1. Explain the proposed approach.
2. Explain the tradeoffs.
3. Point out relevant TypeScript or software-design concepts.
4. Prefer hints or pseudocode unless implementation was explicitly requested.

Direct implementation is acceptable for:

* Boilerplate
* Styling
* Configuration
* Build tooling
* DevOps
* Repetitive code
* Clearly requested implementations

Do not agree with a design merely because it was suggested. Identify mistakes, unnecessary complexity, and better alternatives.

## Scope discipline

Work one milestone at a time.

Read `TODO.md` before beginning work and focus only on the current milestone. Do not implement future features unless explicitly requested.

Avoid:

* Premature optimization
* Unnecessary abstractions
* Speculative extensibility
* Large refactors without a clear benefit
* New dependencies without a concrete reason
* Building AI, authentication, persistence, or collaboration prematurely

Choose the simplest design that preserves the important architectural boundaries.

## Core architecture

The domain graph is the source of truth.

The intended data flow is:

```text
User Input
→ Validated Command
→ Domain Graph
→ React Flow Renderer
```

The domain model must remain independent from React Flow.

Therefore:

* Do not store React Flow nodes or edges as the canonical domain state.
* Do not import React Flow types into the domain layer.
* Convert domain entities into React Flow nodes and edges through a renderer or adapter.
* Manual edits must eventually translate into domain operations.
* AI output must be validated before it affects the domain graph.
* AI must never directly mutate React Flow state.
* Use deterministic TypeScript for calculations whenever possible instead of AI.

## Engineering conventions

* Use TypeScript with strict, explicit types.
* Avoid `any` unless there is a documented, unavoidable reason.
* Prefer clear names over clever abstractions.
* Keep functions focused and side effects visible.
* Separate domain logic from framework and UI concerns.
* Keep components small enough to understand, but do not split them solely to reduce line count.
* Prefer composition over deep inheritance.
* Validate data at system boundaries.
* Do not add a library when a small amount of clear TypeScript is sufficient.

## Documentation

Keep these files aligned with the actual implementation:

* `README.md` — product overview and local setup
* `TODO.md` — current milestone and actionable tasks
* `ARCHITECTURE.md` — architectural decisions, boundaries, and tradeoffs
* `AGENTS.md` — durable instructions for coding agents

Do not document planned functionality as if it is already implemented.

When an architectural decision changes, update `ARCHITECTURE.md`.

When a milestone task is completed or changed, update `TODO.md`.

## Verification

Before considering a coding task complete, run the relevant checks.

At minimum:

```bash
npm run lint
npm run build
```

Run tests when a test suite exists or when the task adds tests.

Report:

* What changed
* Why it changed
* Which checks were run
* Any unresolved risks or follow-up work

Do not commit, push, install dependencies, or make broad unrelated changes unless explicitly requested.
