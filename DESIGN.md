---
name: Architekt
description: A schematic workbench with compact tools around a dominant architecture canvas.
colors:
  canvas-light: "#F8FAFC"
  canvas-dark: "#0B1220"
  surface-light: "#FFFFFF"
  surface-dark: "#111827"
  surface-subtle-light: "#F1F5F9"
  surface-subtle-dark: "#1E293B"
  chrome-light: "#F4F6F8"
  chrome-dark: "#151E2B"
  chrome-hover-light: "#E9EDF2"
  chrome-hover-dark: "#263449"
  text-primary-light: "#0B1220"
  text-primary-dark: "#F8FAFC"
  text-secondary-light: "#475569"
  text-secondary-dark: "#CBD5E1"
  text-muted-light: "#64748B"
  text-muted-dark: "#94A3B8"
  border-light: "#E2E8F0"
  border-dark: "#334155"
  diagram-grid-light: "#D5DEE8"
  diagram-grid-dark: "#314052"
  diagram-line-light: "#52647A"
  diagram-line-dark: "#A9B8CA"
  diagram-node-border-light: "#B8C5D2"
  diagram-node-border-dark: "#53657A"
  diagram-boundary-border-light: "#A9B9C9"
  diagram-boundary-border-dark: "#65768B"
  accent: "#4F46E5"
  accent-ink-light: "#4338CA"
  accent-ink-dark: "#A5B4FC"
  accent-hover: "#6366F1"
  accent-soft-light: "#E0E7FF"
  accent-soft-dark: "#1E1B4B"
  focus-ring-light: "#6366F1"
  focus-ring-dark: "#818CF8"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
typography:
  appIdentity:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "20px"
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

**Creative North Star: "The Schematic Workbench."** Architekt is a precise engineering workspace. A compact command bar, a labeled creation library, and an on-demand utility dock support the architecture canvas without competing for its height.

**The Canvas First Rule.** Give the diagram the most available space and visual emphasis. Use accent only for primary actions, focus, selection, and meaningful state.

## Colors

Use the frontmatter tokens as the normative light and dark palette. Quiet neutral chrome distinguishes tools from the canvas; indigo is the single accent, with a separate readable text value for active tools. Success, warning, and danger communicate semantic state only.

**The Single Accent Rule.** Do not introduce rainbow infrastructure categories, neon cyberpunk treatments, gradients, or decorative color. Color must never be the sole state or category signal.

## Typography

Use Inter for product UI and reserve monospace for identifiers, protocols, capacity figures, and code-like values. Use sentence case, concise technical labels, and typically no more than weights 400, 600, and 700 on one screen. Keep workspace body copy at 14px; 10-11px UI text is not allowed.

**The Scanability Rule.** Use monospace selectively; a whole screen of technical type is harder to scan.

## Layout

Use a 4px base unit and an 8px rhythm for most product spacing. The command bar is compact and the canvas fills the remaining viewport height; it is not inside a padded dashboard card. At widths of at least 1024px, a narrow labeled creation library sits left of the canvas and an optional 320px utility dock sits right. The dock scrolls independently and never reduces canvas height. Structure holds component, connection, and boundary listings; boundary creation/details, Analysis, and AI use the same dock one at a time. Opening, closing, and switching views are transient UI state.

Below 1024px, the creation library and utility dock become dismissible lower sheets capped below half the workspace height. The command bar wraps into compact labeled rows, retains direct access to Generate, Add, Auto-layout, Structure, Analysis, and the document title, and leaves the upper canvas visible. Undo/Redo may use accessible icon buttons at these widths. Sheet contents scroll independently; focus moves to the close control on opening and returns to the trigger on closing. Boundary creation appears first in the mobile Add sheet so it is visible without scrolling through component kinds.

## Design Brief interaction

Architekt remains the product identity; a separate compact document-title button shows the canonical title or the presentation-only “Untitled architecture” fallback. It opens the existing utility dock, with visual truncation and the full title available to assistive technology. The dock edits one transient four-field plain-text draft: title, requirements and constraints, assumptions and open questions, and decisions and tradeoffs. Short guidance encourages choice → reason → alternative → downside without imposing a structured record. The diagram stays primary, and the dock scrolls independently.

Save validates and commits all fields as one history step; Cancel restores the saved brief while leaving the dock open. Dirty drafts require an explicit native discard confirmation before closing or switching views. A clean draft follows Undo/Redo; if the saved brief changes under a dirty draft, the user must choose to load the saved brief or keep the draft before saving. Save is unavailable during node or boundary dragging. These notes express user intent; Analysis checks only modeled structure and AI does not author the brief in v1.

The top of the Design Brief dock contains four compact document actions: Export JSON, Export Markdown, Export PNG, and Import JSON. Exports use committed content only, wait for a dirty brief draft to be resolved, and are unavailable during node/boundary dragging or inline rename. Markdown preserves the user-authored brief as escaped prose and lists modeled components, boundaries, and directed relationships without coordinates or renderer data. PNG needs a modeled component and captures the entire diagram in the existing light palette, without the drafting grid, editor chrome, selection, or focus marks. While it prepares, the PNG action is disabled and its status is announced; a reduced-resolution success is announced. Import JSON opens another view in the same dock after the existing dirty-draft decision. A native file picker leads to a concise title/count/brief preview and an explicit Replace document action; Cancel leaves the current workspace alone. The copy states full-document replacement and one-step Undo. The lower-sheet layout and focus behavior remain the same at narrow widths.

Cross-format acceptance checked real downloads in installed Windows Chrome, Edge, and Brave. The light export palette held from both editor themes; pan, zoom, and a 390px sheet did not crop the diagram. Keyboard operation, status/error semantics, disabled PNG guidance, focus restoration, and hidden staging were checked through browser automation. Actual screen-reader speech was not manually verified.

## Boundary containers

Non-empty generic boundaries appear as nearly transparent, fine dashed containment rectangles behind member components and ordinary edges. A 32px, minimally filled header carries a small outlined square and the boundary name; it remains the only selectable and draggable part. Long names truncate visually while the full name remains accessible. The interior does not intercept member nodes, anchors, edges, or practical canvas hit targets. Selection changes the perimeter to a solid accent line with a separate precise outline; keyboard focus uses a dashed outline on the header. No provider icons, type colors, or semantic boundary styles are introduced.

One boundary may be selected at a time, exclusively from component selection. Header drag moves its canonical members together while preserving their spacing; independent component movement reshapes the derived rectangle but never changes membership. The focused header supports Enter/Space selection, arrow movement by 5px or 20px with Shift, and Delete/Backspace deletion of a selected boundary. Empty boundaries have no canvas rectangle. The creation library opens an explicit name-and-members form in the utility dock; Structure lists every boundary, including empty ones, and opens compact details for rename, membership, and deletion. Component rows expose native boundary selects for assignment, transfer, and ungrouping. Grouped members are disabled during new-boundary creation, and selected eligible canvas components are only prechecked defaults. Deletion copy explains that components and connections remain.

## Auto-Layout interaction

Diagrams start in a left-to-right flow. Four shared anchors allow incoming or outgoing connections on any side, with attachment adapting to relative node geometry. Arrowheads and the ordered connection list convey canonical direction; a side does not imply source or target.

The Auto-layout button sits in the compact command bar beside Undo/Redo. The bar wraps at narrow widths without taking half the editor. The native button supports Tab, Enter, and Space with the existing focus ring; activation leaves focus on the button. It is disabled for an empty graph, an active node drag, or inline rename, while incomplete measurements remain acceptable. A changed layout gives a polite visually hidden status, a no-op announces that the diagram is already arranged, and failure uses a concise visible alert.

Fit view is a separate command-bar action. It frames components and non-empty boundaries in the current canvas, including with the utility dock open, without running layout or editing saved positions. It does not enter Undo history. On narrow screens it remains directly available beside the other workspace actions.

Changed explicit layouts fit the current canvas immediately with conservative padding and no animation. Horizontal rank and node spacing leave useful room for semantic edge labels and handles; labels remain neutral presentation, not inputs to layout or custom edge routing.

With non-empty boundaries, Auto-layout arranges members inside each boundary first, then spaces the resulting boundary rectangles alongside ungrouped components. Empty boundaries are ignored. The action still moves only components; the visible containers rederive around them and fit within the ordinary canvas view, including narrow viewports where the zoom floor permits a full fit. Undo restores all prior component positions in one step. No additional layout controls or boundary positioning fields appear.

## AI proposal review

Generate architecture opens the utility dock. The prompt, loading/Cancel, safe errors, proposal summary, assumptions, directed connection list, and explicit Apply/Discard retain their existing behavior and copy. Long review content scrolls within the dock, leaving canvas height stable. The review identifies an AI-generated draft and says it is not a validated design. Apply remains disabled during rename or drag and replaces the diagram only on explicit activation. Cancel, Discard, and successful Apply return focus to the persistent command-bar Generate control. A polite status announces draft readiness even if the dock was closed while generation continued. Primary generation actions use white text on indigo in either theme.

Voice is an alternative input inside this dock. Speak requests permission only on activation; Recording shows elapsed time, Stop, and Cancel without decorative audio UI. The user reviews and can edit a completed transcript in the same generation prompt before explicitly selecting Generate. A recording may not be hidden by switching docks; permission requests are canceled on exit, while transcription and completed text can survive a dock switch in session memory. At 110 seconds a one-time warning appears; at 120 seconds recording stops automatically. Audio over 3 MiB is rejected. A transcript over 5,000 characters remains editable with Generate disabled until shortened. Browser and provider errors use safe local copy and retain existing prompt text unless transcription succeeds. The verified v1 browser target is English on Windows desktop with a physical microphone in Chrome, Edge, and Brave; the approximately 390px layout is also verified. Mobile microphone use, Safari, Firefox, macOS, multilingual transcription, and actual screen-reader speech remain unverified.

## Architecture analysis

Analysis opens in the utility dock. A concise summary shows component, connection, disconnected-region, and reciprocal-pair counts. Review questions and structural observations use neutral wording, with evidence behind native disclosures and incoming/outgoing counts behind a separate disclosure. An empty graph invites component creation; zero findings means only that the current checks found none. A polite status announces changes in finding counts while Analysis is open. Analysis never selects, mutates, or scores the diagram.


## Adaptive anchor interaction

Every component kind uses the same four neutral, visible 8px anchor marks. Their transparent 32px interaction boxes exceed the visual marks without changing measured node dimensions. Hover is not required to find or use them; no kind-specific colors or extra hover-only controls are introduced. Practical mouse/touch hit testing, including at reduced zoom, passed manual browser acceptance; 32px canvas targets are not a claim of a 44px touch target.

Pending creation outlines the source node and enlarges/thickens the chosen source mark; destination marks also become more apparent. Shape, outline, and visible status supplement color. The visible status says “Connecting from Service. Choose a destination.” Accepted creation reuses the polite success announcement, “Connected Service to Cache.” Rejections use the existing visible connection error, without a toast or forced focus movement.

One shared anchor per node is in the Tab sequence, initially right. Arrow keys focus top/right/bottom/left; Enter/Space start or complete through the same interaction as click/tap. Tab and Shift+Tab leave the group normally. Focus receives a visible 2px theme-token outline. Accessible names distinguish starting, choosing a destination, and changing the pending source side; duplicate names receive IDs only when ambiguous. A shared described instruction explains arrows, activation, and Escape rather than repeating the whole instruction in each name. List or canvas rename disables that component's anchors and removes them from Tab order; anchor double-click does not initiate rename.

Escape and empty-canvas click dismiss pending creation. Moving focus outside the canvas preserves the draft; no blur heuristics cancel navigation between nodes. Manual acceptance confirmed this behavior.

Derived edges attach to the mutually facing cardinal handle pair that best balances endpoint distance and outward direction. Mixed side pairs are appropriate for some diagonal relationships; direct horizontal and vertical relationships retain conventional opposing attachments. Ordinary edges retain the built-in curve. Both directions of a reciprocal pair overlap on one standard Bézier center path, so their independent target arrowheads show flow both ways. Their non-Generic semantic labels sit a small distance on opposite sides of the shared path. Preserve neutral stroke and label surface/text tokens in both themes; Generic has no visible label. Short/long edges, crowded triangles, fan-in/out, and reciprocal labels require visual acceptance, not pixel assertions. Label collision avoidance is deferred.

At narrow widths, preserve the canvas and the anchor interaction underneath the compact command bar and lower sheets. Anchors do not enlarge node layout, require hover, or introduce a separate mobile UI. Light/dark focus contrast, touch behavior, keyboard order, and DOM status semantics have been checked manually; actual screen-reader speech has not been verified.

## Elevation & Depth
Use 1px borders for pane seams, fields, true containment, and selected states. Group ordinary controls through spacing and alignment rather than nested rectangles. Shadows are reserved for floating layers (menus, popovers, responsive sheets, dialogs, and dragged nodes); standard controls have no glow. Selected nodes may use an accent border and soft outer ring instead of a heavy shadow.

Motion is functional: 100-150ms for hover, pressed, and focus; 150-200ms for menus and small panels; 200-250ms for useful large-panel reveals. Respect reduced-motion preferences. Avoid gratuitous canvas animation and layout animation that harms spatial orientation.

## Shapes

Use `sm` for chips and compact controls, `md` for inputs, buttons, and diagram nodes, `lg` for panels/cards/dropdowns, and `xl` for dialogs or major floating surfaces. `full` is for status dots and avatars only.

**The Engineered Geometry Rule.** Avoid oversized radii and pill-shaped controls; the workspace should feel engineered, not bubbly.

## Components

- **Buttons:** command-bar actions are compact, labeled, and mostly borderless. Primary generation actions retain accent fill and light text. Icon buttons are 32-36px, transparent or on a subtle surface, with accessible names and visible focus.
- **Inputs and creation:** fields and native selects retain a visible 1px border and focus ring. The creation library uses compact 40px icon-and-label rows in common-first order: Service, Database, Cache, Queue, Client, Gateway, Storage, External service, then Generic. Each action retains its explicit `Add [type] component` name and one-click creation behavior. Existing-component and connection-kind editing use native text-only selects in the Structure dock, with conditional ID disambiguation when names are ambiguous.
- **Panels and lists:** the creation library and optional utility dock are adjoining workspace surfaces, separated by a single seam. Dock content scrolls independently. Structure lists use unboxed rows with quiet separators; rename, kind, and delete remain available. Avoid card-inside-card treatment and competing internal scroll regions.
- **Iconography:** use one restrained outline family (Lucide preferred): 16px inline/button icons, 18px toolbar icons, 24-32px empty-state icons. Do not mix filled and outline systems. Ambiguous or destructive icon actions require an accessible name and tooltip.
- **React Flow canvas:** use a quiet 20px dot grid with dedicated light/dark grid ink, distinct from the neutral application chrome. Keep canvas controls compact 32-36px icon buttons on a bordered surface.
- **Nodes:** uniform flat rectangles retain their 176px minimum width, measured 66px content height, and shared 176 x 72 fallback geometry. A 4px radius and a stronger neutral 1px perimeter replace the softer card appearance. The 14px/600 name remains primary; an 11.5px muted kind row with a 14px outline icon retains readable text. Tighter row spacing is balanced by padding so measured geometry stays fixed. Kind icons are decorative wherever they supplement visible labels, including the creation picker; native text-only selects remain icon-free. Types do not receive unique colors, gradients, borders, or semantic shapes.
- **Edges:** use a 1.5px shared neutral directional stroke, with compact closed arrowheads in exactly the same ink. Non-Generic semantics remain 12px/600 labels on a slim, borderless surface cutout; Generic is visually unlabeled. Semantics never change edge color, iconography, animation, line pattern, stroke, or arrowhead. Every edge exposes an ARIA description containing current endpoint names and the human-readable semantic kind. Reciprocal directions retain one shared center path, two arrowheads, and opposite-side semantic labels. Dense convergences can still cause label collisions because this phase does not change routing or Auto-Layout.
- **Anchors and states:** four 32px hit areas retain faint neutral center marks at rest; hover, selection, and keyboard focus reveal stronger marks without shrinking the hit area. A pending source has a filled accent-soft mark and a dark dashed node outline, while destinations get stronger neutral marks. Component selection uses a crisp accent perimeter with an inset line; keyboard node focus uses an offset dashed focus outline. Boundary selection uses a solid accent perimeter plus a thin separate outline; header focus is dashed. These shapes distinguish selection, focus, and pending creation without relying on color alone. Disabled controls remain legible, errors use danger text with explanation, and success uses concise status rather than a full tinted surface.

## Do's and Don'ts

- Do target WCAG AA contrast for text and interactive states.
- Do provide visible 2px keyboard focus rings and preserve keyboard navigation order.
- Do give every interactive icon an accessible name; tooltips do not replace screen-reader labels.
- Do provide a non-color cue for selected, error, and success states.
- Do communicate component kind with visible text; the icon supplements the label and is never the sole semantic cue.
- Do communicate non-Generic connection semantics with concise text and expose every connection kind, including Generic, through an accessible edge description.
- Don't assign semantic colors, icons, animation, or line patterns to connection kinds.
- Do keep touch targets around 40px or larger when icons appear smaller.
- Do keep React Flow styling and coordinates outside the domain model.
- Don't show controls or visual detail for behavior the product does not yet implement.
- Don't use excessive glassmorphism, dense enterprise-dashboard chrome, large workspace gradients, or overly playful illustration.
- Don't add tokens until a repeated product need establishes them.
