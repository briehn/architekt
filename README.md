# Architekt

Architekt is a system-design application being built as a production-quality portfolio project. Its goal is to help people turn software-system ideas into clear, editable architecture diagrams while keeping the underlying model understandable and maintainable.

## Current status

The **Project foundation** milestone is complete. The repository provides a minimal branded application shell and the tooling needed to develop, lint, and build the application. Diagramming and product workflows are not implemented yet.

## Currently implemented

- A Next.js App Router application with TypeScript and Tailwind CSS
- A responsive, semantic Architekt application shell
- Project-level ESLint and production build commands
- Repository guidance that documents the intended engineering and architectural boundaries

## Planned vision

The long-term vision is a workspace where a user can describe a software system and receive a clean, editable architecture diagram. Planned capabilities include a validated domain graph, a renderer for visualizing that graph, and carefully bounded AI assistance.

React Flow, diagram editing, AI integration, persistence, authentication, and collaboration are planned only; none are currently implemented.

## Architecture principle

The domain graph is the future source of truth. It must remain independent from React Flow and other rendering concerns:

```text
User input → validated command → domain graph → renderer
```

React Flow will eventually render an adapted view of the domain graph rather than becoming the canonical application state. This keeps domain behavior testable without a browser or UI library and gives future manual edits and AI output a shared, validated path into the system.

## Tech stack

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- ESLint

## Local setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

Run the standard checks before handing off changes:

```bash
npm run lint
npm run build
```

## Roadmap

This project is being built incrementally, with each milestone focused on a clear boundary and verifiable outcome. The project foundation is complete; future work has not yet been scheduled into a new milestone.

The long-term direction remains a framework-independent domain graph, followed by a rendering adapter and deliberate diagram interaction. Planned functionality will be documented as implemented only when it is present, validated, and maintainable.
