# Architekt

**An AI-assisted system-design workbench for turning a system idea into an editable, explainable architecture.** Describe or speak requirements, refine the diagram, document decisions, inspect grounded feedback, and export the result.

**Live demo:** public Vercel/Redis/HTTPS acceptance is still in progress. Until that release gate passes, [open the prepared architecture](docs/demo/url-shortener.architekt.json) locally or follow the [three-minute demo script](docs/demo/demo-script.md).

![Architekt Workbench showing a URL shortener, Click analytics boundary, and saved Design Brief](docs/screenshots/workbench.png)

## The workflow

1. **Describe or speak.** Type a system request or record English speech, edit the transcript, then explicitly generate a proposal. Review its assumptions, component kinds, and directed connections before Apply.
2. **Model and edit.** Create typed components, semantic connections, and one-level boundaries. Move nodes, Auto-layout, Fit view, and Undo/Redo meaningful edits.
3. **Explain decisions.** Save requirements, open questions, and tradeoffs in the plain-text Design Brief beside the diagram.
4. **Analyze and review.** Deterministic Analysis reports modeled structural observations. Grounded Review separately uses OpenAI to select evidence, quote exact saved Brief excerpts, and pose conditional tradeoffs and questions; it never scores or edits the design.
5. **Export.** Download canonical V5 JSON for round trips, deterministic Markdown for reading, or a complete stable-light diagram PNG. JSON import previews a full-document replacement before one-step Apply.

The [prepared URL-shortener document](docs/demo/url-shortener.architekt.json) demonstrates the full editable workflow. Its [Markdown export](docs/demo/url-shortener.md) and [PNG export](docs/screenshots/portable-diagram.png) were downloaded from Architekt itself. The diagram keeps click reporting off the modeled redirect path; its saved Brief states assumptions and tradeoffs rather than presenting them as verified facts.

![Clean URL-shortener PNG exported from Architekt](docs/screenshots/portable-diagram.png)

## Engineering choices

- **Canonical structure, derived canvas.** Immutable `ArchitectureGraph` owns components, connections, boundaries, and invariants; React Flow renders projections. Positions and DesignContext live in editor state, while measurements and selection remain transient.
- **Deterministic facts, bounded AI reasoning.** Analysis computes graph facts locally. Grounded Review formats modeled facts deterministically and permits only exact committed Brief excerpts as stated context; provider output must resolve to validated evidence.
- **Safe asynchronous editing.** Proposals and reviews remain transient. Cancellation, operation versions, and snapshot comparisons prevent stale responses from replacing current work. Apply, import, and document edits use ordinary one-step history.
- **Public editor, protected paid AI.** Manual work and local exports need no invite. Generate, Transcribe, and Review require a one-time invite-derived HttpOnly session and atomic Redis admission. A global switch, weighted allowances, rate limits, and concurrency limits fail closed before provider construction. Admission units are **not** exact OpenAI billing.
- **Portable documents.** Strict V1–V5 restoration validates canonical data; JSON is the machine format, while Markdown and PNG are derived local exports that never mutate the document.

The [architecture notes](ARCHITECTURE.md) explain ownership and tradeoffs. The [product decisions](PRODUCT.md), [interaction design](DESIGN.md), and [dated evaluations](docs/evaluations/) provide more detail.

## Run locally

Use Node.js **22.13 or later**:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The public Workbench works without AI credentials. Import [the demo JSON](docs/demo/url-shortener.architekt.json) through the document-title control to try editing, Analysis, Design Brief, and exports.

Paid AI needs server-only OpenAI and managed Redis configuration, two independent credential-hashing secrets, an exact allowed origin, operator initialization, and an invite. See [.env.example](.env.example) and the [deployment runbook](docs/public-demo-runbook.md); never place these values under `NEXT_PUBLIC_` or commit them. Generation defaults to `gpt-6-luna` with medium reasoning, Review to `gpt-6-sol` with medium reasoning, and transcription to `gpt-transcribe`. The [generation](docs/evaluations/ai-generation-2026-10-01.md), [Review](docs/evaluations/grounded-review-2026-10-11.md), and [Voice](docs/evaluations/voice-to-architecture-2026-10-03.md) evaluations record why and where human review remains necessary.

## Validation and scope

```bash
npm test
npx tsc --noEmit
npx eslint . --quiet
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev
```

Vitest protects domain, analysis, history, persistence, import/export, AI boundaries, and paid-route admission. Playwright covers the production-built Workbench and mocked paid-provider flows. CI runs these checks and executes isolated real-Redis atomic tests when test credentials are configured. The [Portable Documents acceptance](docs/evaluations/portable-documents-2026-10-04.md) inspected actual downloads in Windows Chrome, Edge, and Brave.

Architekt stores one workspace per browser origin, without accounts, cloud sync, or collaboration. The Design Brief is user-authored and unverified; Review is advisory. AI availability depends on invited access, the provider, and the central store, while manual editing and local exports remain usable. Large diagrams can become visually dense; PNG proportionally reduces resolution before cropping. Review has explicit input limits. Voice v1 is verified for English on Windows desktop with a physical microphone in Chrome, Edge, and Brave; mobile microphone behavior, Safari, Firefox, macOS, multilingual transcription, and actual screen-reader speech remain unverified. The public deployment has **not** passed its final Vercel/Redis/HTTPS gate yet.
