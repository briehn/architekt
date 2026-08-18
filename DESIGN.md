---
name: Architekt
description: A precise, calm system-design workspace with a canvas-first visual hierarchy.
colors:
  canvas-light: "#F8FAFC"
  canvas-dark: "#0B1220"
  surface-light: "#FFFFFF"
  surface-dark: "#111827"
  surface-subtle-light: "#F1F5F9"
  surface-subtle-dark: "#1E293B"
  text-primary-light: "#0B1220"
  text-primary-dark: "#F8FAFC"
  text-secondary-light: "#475569"
  text-secondary-dark: "#CBD5E1"
  text-muted-light: "#64748B"
  text-muted-dark: "#94A3B8"
  border-light: "#E2E8F0"
  border-dark: "#334155"
  accent: "#4F46E5"
  accent-hover: "#6366F1"
  accent-soft-light: "#E0E7FF"
  accent-soft-dark: "#1E1B4B"
  focus-ring-light: "#6366F1"
  focus-ring-dark: "#818CF8"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
typography:
  display:
    fontFamily: "Inter Display, Inter, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "42px"
  h1:
    fontFamily: "Inter, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "34px"
  h2:
    fontFamily: "Inter, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: "26px"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
  mono:
    fontFamily: "monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface-light}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-primary-light}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
  input:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-primary-light}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "36px"
---

## Overview

**Creative North Star: "The Calm Technical Workspace."** Architekt is precise, capable, modern, and approachable to learners. The architecture canvas carries the greatest visual weight; chrome, navigation, and controls provide quiet structure.

**The Canvas First Rule.** Give the diagram the most available space and visual emphasis. Use accent only for primary actions, focus, selection, and meaningful state.

## Colors

Use the frontmatter tokens as the normative light and dark palette. Neutral slate surfaces and borders establish structure; indigo is the single accent. Success, warning, and danger communicate semantic state only.

**The Single Accent Rule.** Do not introduce rainbow infrastructure categories, neon cyberpunk treatments, gradients, or decorative color. Color must never be the sole state or category signal.

## Typography

Use Inter for product UI and reserve monospace for identifiers, protocols, capacity figures, and code-like values. Use sentence case, concise technical labels, and typically no more than weights 400, 600, and 700 on one screen. Keep workspace body copy at 14px; 10-11px UI text is not allowed.

**The Scanability Rule.** Use monospace selectively; a whole screen of technical type is harder to scan.

## Layout

Use a 4px base unit and an 8px rhythm for most product spacing. Headers are 48-56px tall. On desktop, sidebars target 240-280px and inspectors 280-320px; the canvas fills the remaining viewport and must not sit in a centered marketing-style container.

Desktop (>=1024px) shows full editor chrome. Tablet (768-1023px) collapses secondary panels while preserving the canvas and primary tools. Mobile (<768px) prioritizes viewing, pan/zoom, and inspection; full editing is undecided/deferred.

## Elevation & Depth

Use 1px borders for static structure. Shadows are reserved for floating layers (menus, popovers, dialogs, and dragged nodes); standard controls have no glow. Selected nodes may use an accent border and soft outer ring instead of a heavy shadow.

Motion is functional: 100-150ms for hover, pressed, and focus; 150-200ms for menus and small panels; 200-250ms for useful large-panel reveals. Respect reduced-motion preferences. Avoid gratuitous canvas animation and layout animation that harms spatial orientation.

## Shapes

Use `sm` for chips and compact controls, `md` for inputs, buttons, and diagram nodes, `lg` for panels/cards/dropdowns, and `xl` for dialogs or major floating surfaces. `full` is for status dots and avatars only.

**The Engineered Geometry Rule.** Avoid oversized radii and pill-shaped controls; the workspace should feel engineered, not bubbly.

## Components

- **Buttons:** primary and secondary buttons are 36px high with `md` radius. Primary uses accent fill and light text; secondary uses a surface fill and border. Icon buttons are 32-36px, transparent or on a subtle surface.
- **Inputs:** text inputs and select triggers are 36px, `md` radius, surface fill, 1px border, and visible focus ring. Textareas/prompts have `lg` radius, generous padding, and a 72px minimum height.
- **Panels and navigation:** panels, menus, cards, and dropdowns use surface backgrounds, structural borders, and `lg` radius. Navigation/sidebar chrome stays visually quiet and scrolls independently when necessary. Exact navigation item styling is undecided.
- **Iconography:** use one restrained outline family (Lucide preferred): 16px inline/button icons, 18px toolbar icons, 24-32px empty-state icons. Do not mix filled and outline systems. Ambiguous or destructive icon actions require an accessible name and tooltip.
- **React Flow canvas:** use the canvas tokens and a subtle 16-24px dot grid at very low contrast. Keep canvas controls compact 32-36px icon buttons on a bordered surface.
- **Nodes:** default nodes are 160-200px wide, at least 48px tall, `md` radius, and have a 1px border. Node surfaces use the surface token; labels use 14px/600 primary text; metadata is 12px secondary text or monospace. Category/technology body content, footer metrics, and category accents are future/undecided until the model supports them.
- **Edges:** use a 1.5-2px neutral directional stroke with small, clear, consistent arrowheads. Selected edges use accent. Handles remain hidden or subtle until hover/connection mode.
- **States:** hover uses a small surface/accent shift; pressed is slightly darker; selected uses an accent border plus accent-soft background/ring where appropriate; disabled reduces contrast while remaining legible and removes pointer affordance; errors use danger border/text with concise explanation; success uses success icon/text rather than full green surfaces.

## Do's and Don'ts

- Do target WCAG AA contrast for text and interactive states.
- Do provide visible 2px keyboard focus rings and preserve keyboard navigation order.
- Do give every interactive icon an accessible name; tooltips do not replace screen-reader labels.
- Do provide a non-color cue for selected, error, and success states.
- Do keep touch targets around 40px or larger when icons appear smaller.
- Do keep React Flow styling and coordinates outside the domain model.
- Don't show controls or visual detail for behavior the product does not yet implement.
- Don't use excessive glassmorphism, dense enterprise-dashboard chrome, large workspace gradients, or overly playful illustration.
- Don't add tokens until a repeated product need establishes them.
