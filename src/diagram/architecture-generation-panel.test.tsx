import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { minimalProposal } from "../application/__fixtures__/architecture-proposals";
import { generationFailure } from "../application/architecture-generation";
import { ArchitectureGenerationPanel } from "./architecture-generation-panel";
import type { ArchitectureGenerationReviewState } from "./architecture-generation-review";

function render(review: ArchitectureGenerationReviewState, applyDisabled = false) {
  return renderToStaticMarkup(<ArchitectureGenerationPanel
    review={review}
    applyDisabled={applyDisabled}
    onPromptChange={() => {}}
    onGenerate={() => {}}
    onCancel={() => {}}
    onApply={() => {}}
    onDiscard={() => {}}
  />);
}

describe("architecture generation panel", () => {
  it("renders a labelled prompt and Generate action", () => {
    const markup = render({ status: "idle", prompt: "" });
    expect(markup).toContain("Describe your system");
    expect(markup).toContain("Generate</button>");
    expect(markup).toContain('maxLength="5000"');
  });

  it("shows loading with Cancel and a safe inline typed error", () => {
    const loading = render({ status: "loading", prompt: "A system" });
    expect(loading).toContain("Generating proposal");
    expect(loading).toContain("Cancel</button>");
    expect(loading).not.toContain("Apply to diagram");
    const error = render({ status: "error", prompt: "A system", error: generationFailure("generation-timeout") });
    expect(error).toContain("Generation took too long");
    expect(error).toContain('role="alert"');
  });

  it("reviews a draft with its assumptions, typed nodes, and directed relationships", () => {
    const markup = render({ status: "review", prompt: "A system", proposal: minimalProposal(), applyError: false }, true);
    expect(markup).toContain("AI-generated draft");
    expect(markup).toContain("not a validated design");
    expect(markup).toContain("Apply replaces your current diagram. You can Undo to restore it.");
    expect(markup).toContain("Architecture draft ready. Review it before applying.");
    expect(markup).toContain("A small application with a client, API, and database.");
    expect(markup).toContain("None stated.");
    expect(markup).toContain("Client");
    expect(markup).toContain("Request/response");
    expect(markup).toContain("Apply to diagram");
    expect(markup).toContain("Discard</button>");
    expect(markup).toMatch(/disabled=""[^>]*>Apply to diagram/);
  });

  it("renders the same generation workflow as dock content without a second toggle", () => {
    const markup = render({ status: "review", prompt: "A system", proposal: minimalProposal(), applyError: false });
    expect(markup).not.toContain("Generate architecture</button>");
    expect(markup).toContain("AI-generated draft");
    expect(markup).toContain("Apply to diagram");
    expect(markup).toContain("Discard</button>");
    expect(markup).not.toContain("max-h-[min(42vh,26rem)]");
  });
});
