import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { minimalProposal } from "./__fixtures__/architecture-proposals";
import { generateArchitecture } from "./generate-architecture";
import {
  ARCHITECTURE_GENERATION_PROMPT_LIMIT,
  generationFailure,
  type ArchitectureGenerationProviderResult,
} from "./architecture-generation";
import { ArchitectureGraph } from "../domain/architecture-graph";

describe("architecture generation service", () => {
  it("trims input and proposal text, admits through domain operations, and returns no graph or IDs", async () => {
    const proposal = { ...minimalProposal(), summary: "  A useful system.  " };
    const generate = vi.fn().mockResolvedValue({ ok: true, output: proposal });
    const addComponent = vi.spyOn(ArchitectureGraph.prototype, "addComponent");
    const addConnection = vi.spyOn(ArchitectureGraph.prototype, "addConnection");
    try {
      const result = await generateArchitecture({ prompt: "  Build a system  " }, { generate });
      expect(generate).toHaveBeenCalledExactlyOnceWith({ prompt: "Build a system" });
      expect(result).toEqual({ ok: true, proposal: { ...proposal, summary: "A useful system." } });
      expect(addComponent).toHaveBeenCalledTimes(3);
      expect(addConnection).toHaveBeenCalledTimes(2);
      expect(proposal.summary).toBe("  A useful system.  ");
      expect(JSON.stringify(result)).not.toContain("admission-");
    } finally {
      addComponent.mockRestore();
      addConnection.mockRestore();
    }
  });

  it.each([
    "generation-refused", "generation-incomplete", "generation-timeout", "generation-rate-limited",
    "provider-unavailable", "configuration-unavailable", "invalid-generation", "generation-failed",
  ] as const)("normalizes fake provider failure %s", async (type) => {
    const generate = vi.fn(async (): Promise<ArchitectureGenerationProviderResult> => ({ ok: false, type }));
    expect(await generateArchitecture({ prompt: "System" }, { generate })).toEqual({ ok: false, error: generationFailure(type) });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    null, {}, { prompt: "" }, { prompt: " \n " }, { prompt: 3 }, { prompt: "System", model: "browser-model" },
    { prompt: "x".repeat(ARCHITECTURE_GENERATION_PROMPT_LIMIT + 1) },
  ])("rejects invalid input before calling provider: %j", async (input) => {
    const generate = vi.fn();
    expect(await generateArchitecture(input, { generate })).toEqual({ ok: false, error: generationFailure("invalid-request") });
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    {}, { ...minimalProposal(), coordinates: [] },
    { ...minimalProposal(), connections: [{ sourceRef: "missing", targetRef: "api", kind: "generic" }] },
  ])("rejects invalid generated data", async (output) => {
    expect(await generateArchitecture({ prompt: "System" }, { generate: async () => ({ ok: true, output }) }))
      .toEqual({ ok: false, error: generationFailure("invalid-generation") });
  });

  it("rejects authoritative domain admission failure atomically", async () => {
    const spy = vi.spyOn(ArchitectureGraph.prototype, "addComponent").mockImplementation((component) => ({ ok: false, error: { type: "component-name-empty", componentId: component.id } }));
    try {
      expect(await generateArchitecture({ prompt: "System" }, { generate: async () => ({ ok: true, output: minimalProposal() }) }))
        .toEqual({ ok: false, error: generationFailure("invalid-generation") });
    } finally { spy.mockRestore(); }
  });

  it("contains unexpected provider exceptions without leaking details", async () => {
    const result = await generateArchitecture({ prompt: "private prompt" }, { generate: async () => { throw new Error("private provider response"); } });
    expect(result).toEqual({ ok: false, error: generationFailure("generation-failed") });
  });
});
