# Architekt

**A visual workspace for thinking through software systems.**

I started building Architekt because system design often gets split between two imperfect places: a whiteboard that is easy to change but hard to preserve, and documentation that is accurate but slow to keep current.

Architekt is my attempt to bring those ideas into one focused workspace. The diagram stays visual and editable, while the system behind it remains structured enough to validate, save, undo, and eventually support carefully controlled AI-assisted changes.

## What works today

Architekt currently supports the core editing loop:

- Create and delete architecture components
- Move components around the canvas
- Add and remove directional connections
- Save the current graph and layout in the browser
- Recover safely when saved data is invalid or unavailable
- Undo and redo structural edits and completed node drags
- Use standard history shortcuts such as `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl+Y`

The editor is intentionally small right now. I am building it one complete interaction at a time instead of filling the interface with controls before their behavior is properly defined.

## How it is built

The central idea is that the canvas is a view of the architecture, not the architecture itself.

```text
User action
    -> validated domain operation
    -> architecture graph
    -> React Flow adapter
    -> rendered diagram
```

`ArchitectureGraph` owns the actual components, connections, and rules. React Flow receives nodes and edges derived from that graph, while node positions are kept in a separate layout model.

That separation gives the project a few useful properties:

- Domain behavior can be tested without React or a browser.
- Invalid connections are rejected before they reach the canvas.
- Saved data is validated by rebuilding it through the same domain operations used by the editor.
- Undo and redo can restore meaningful graph and layout snapshots without storing renderer-only details.
- Future AI output can be treated as a proposed set of validated edits instead of being allowed to manipulate the canvas directly.

## Technical highlights

- Immutable graph operations with explicit success and rejection results
- Branded TypeScript identifiers for components and connections
- Controlled React Flow rendering backed by application-owned state
- A versioned persistence format with runtime validation
- Debounced local autosave with clear loading, failure, and recovery states
- Bounded undo/redo history with completed node drags grouped into single actions
- Automated coverage for the domain, layout, rendering adapter, persistence, editor state, history, and keyboard shortcuts

## Stack

- Next.js 16
- React 19
- TypeScript
- React Flow
- Tailwind CSS 4
- Vitest

## Current direction

Architekt is under active development. The next focused feature is component renaming, followed by deeper decisions around component types, connection meaning, layout, and the boundaries of AI-assisted editing.

Screenshots and a live demo will be added when the editor's visual language is mature enough to represent the project well. For now, the repository reflects the working product and the engineering decisions behind it.

## About this repository

This is a personal portfolio project that I am designing and building as a complete product. The source is available to show my approach to product thinking, application architecture, interaction design, and testing. It is not intended to be a starter kit, tutorial project, or community-maintained template, and I am not currently accepting outside contributions.
