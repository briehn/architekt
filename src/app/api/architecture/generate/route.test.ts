import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../../../server/openai-architecture-provider", () => ({ createOpenAIArchitectureProvider: vi.fn() }));

import { POST } from "./route";
import { createOpenAIArchitectureProvider } from "../../../../server/openai-architecture-provider";
import { ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES } from "../../../../server/architecture-generation-http";
import { ARCHITECTURE_GENERATION_PROMPT_LIMIT, generationFailure, type ArchitectureGenerationProviderResult } from "../../../../application/architecture-generation";
import { minimalProposal } from "../../../../application/__fixtures__/architecture-proposals";

const factory = vi.mocked(createOpenAIArchitectureProvider);
function configure(result: ArchitectureGenerationProviderResult = { ok: true, output: minimalProposal() }) {
  vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
  vi.stubEnv("ARCHITEKT_OPENAI_MODEL", "");
  const generate = vi.fn().mockResolvedValue(result);
  factory.mockReturnValue({ generate });
  return generate;
}
function request(body: unknown) {
  return new Request("http://localhost/api/architecture/generate", { method: "POST", body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("POST /api/architecture/generate", () => {
  it("returns only a validated proposal and reads server configuration lazily", async () => {
    const generate = configure();
    const response = await POST(request({ prompt: "  System  " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(minimalProposal());
    expect(generate).toHaveBeenCalledExactlyOnceWith({ prompt: "System" });
    expect(factory).toHaveBeenCalledExactlyOnceWith({ apiKey: "test-only-placeholder", model: "gpt-6-luna" });
  });

  it("uses the optional server model override", async () => {
    configure();
    vi.stubEnv("ARCHITEKT_OPENAI_MODEL", " server-model ");
    expect((await POST(request({ prompt: "System" }))).status).toBe(200);
    expect(factory).toHaveBeenCalledWith({ apiKey: "test-only-placeholder", model: "server-model" });
  });

  it.each([undefined, "", " \n "])("fails safely without a configured key (%j)", async (key) => {
    vi.stubEnv("OPENAI_API_KEY", key);
    const response = await POST(request({ prompt: "System" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: generationFailure("configuration-unavailable") });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    null, [], "System", {}, { prompt: "" }, { prompt: " \n " }, { prompt: 42 },
    { prompt: "x".repeat(ARCHITECTURE_GENERATION_PROMPT_LIMIT + 1) },
    ...["model", "reasoning", "temperature", "systemPrompt", "provider"].map((key) => ({ prompt: "System", [key]: "browser controlled" })),
  ])("rejects invalid body %# before loading configuration", async (body) => {
    configure();
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: generationFailure("invalid-request") });
    expect(factory).not.toHaveBeenCalled();
  });

  it("accepts the exact prompt bound, including escaped UTF-16 input", async () => {
    configure();
    const body = '{"prompt":"' + "\\u0061".repeat(ARCHITECTURE_GENERATION_PROMPT_LIMIT) + '"}';
    expect((await POST(new Request("http://localhost", { method: "POST", body }))).status).toBe(200);
  });

  it.each(["{broken", "", '{"prompt":'])("rejects malformed JSON %j", async (body) => {
    configure();
    expect((await POST(new Request("http://localhost", { method: "POST", body }))).status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized body before reading it", async () => {
    configure();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request("http://localhost", { method: "POST", body, headers: { "content-length": String(ARCHITECTURE_GENERATION_BODY_LIMIT_BYTES + 1) }, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(400);
    expect(cancel).toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])("counts actual streamed bytes even with content-length %j", async (length) => {
    configure();
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { chunks++; controller.enqueue(new Uint8Array(1024).fill(32)); }, cancel,
    });
    const req = new Request("http://localhost", { method: "POST", body, headers: length ? { "content-length": length } : {}, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(400);
    expect(cancel).toHaveBeenCalled();
    expect(chunks).toBeLessThanOrEqual(34);
    expect(factory).not.toHaveBeenCalled();
  });

  it("decodes split multibyte UTF-8 without corruption", async () => {
    const generate = configure();
    const bytes = new TextEncoder().encode(JSON.stringify({ prompt: "Design 日本語" }));
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    expect((await POST(new Request("http://localhost", { method: "POST", body, duplex: "half" } as RequestInit))).status).toBe(200);
    expect(generate).toHaveBeenCalledWith({ prompt: "Design 日本語" });
  });

  it.each([
    ["generation-refused", 422], ["generation-incomplete", 422], ["generation-timeout", 504],
    ["generation-rate-limited", 429], ["provider-unavailable", 503], ["configuration-unavailable", 503],
    ["invalid-generation", 502], ["generation-failed", 502],
  ] as const)("maps %s to %i with only safe public fields", async (type, status) => {
    configure({ ok: false, type });
    const response = await POST(request({ prompt: "private architecture" }));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: generationFailure(type) });
  });

  it("rejects malformed provider proposals", async () => {
    configure({ ok: true, output: { ...minimalProposal(), secret: "private provider detail" } });
    const response = await POST(request({ prompt: "System" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: generationFailure("invalid-generation") });
  });

  it("contains raw exceptions from provider construction or execution", async () => {
    const generate = configure();
    generate.mockRejectedValue(new Error("private architecture, credentials, provider response"));
    expect(await (await POST(request({ prompt: "private prompt" }))).json()).toEqual({ error: generationFailure("generation-failed") });
    factory.mockImplementation(() => { throw new Error("private construction details"); });
    expect(await (await POST(request({ prompt: "private prompt" }))).json()).toEqual({ error: generationFailure("generation-failed") });
  });
});
