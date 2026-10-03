import { expect, test, type Page } from "@playwright/test";

const panel = (page: Page) => page.getByRole("complementary", { name: "AI utility panel" });

async function installSyntheticMicrophone(page: Page) {
  await page.addInitScript(() => {
    const state = window as typeof window & { __voiceMock?: { mode: "granted" | "denied" | "pending"; stopped: number; resolvePermission?: () => void } };
    state.__voiceMock = { mode: "granted", stopped: 0 };
    const track = { stop: () => { state.__voiceMock!.stopped += 1; } };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: async () => {
        if (state.__voiceMock!.mode === "denied") throw new DOMException("Denied", "NotAllowedError");
        if (state.__voiceMock!.mode === "pending") await new Promise<void>((resolve) => { state.__voiceMock!.resolvePermission = resolve; });
        return stream;
      },
    } });
    class SyntheticRecorder {
      static isTypeSupported(value: string) { return value === "audio/webm;codecs=opus"; }
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      state = "inactive";
      mimeType = "audio/webm;codecs=opus";
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1])]) } as BlobEvent);
        this.onstop?.(new Event("stop"));
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: SyntheticRecorder });
  });
}

test("synthetic microphone produces an editable transcript through the existing review and Apply flow", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.route("**/api/architecture/transcribe", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "A chat system with a client and API" }) }));
  await page.route("**/api/architecture/generate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    components: [{ ref: "client", name: "Client", kind: "client" }, { ref: "api", name: "API", kind: "service" }],
    connections: [{ sourceRef: "client", targetRef: "api", kind: "request-response" }],
    summary: "A small client and API design.", assumptions: [],
  }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await expect(panel(page).getByText("Recording", { exact: true })).toBeVisible();
  await expect(panel(page).getByText(/\d+:\d\d \/ 2:00/)).toBeVisible();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  const transcript = panel(page).getByRole("textbox", { name: "Review transcript" });
  await expect(transcript).toHaveValue("A chat system with a client and API");
  await expect(transcript).toBeFocused();
  expect(await page.evaluate(() => (window as typeof window & { __voiceMock: { stopped: number } }).__voiceMock.stopped)).toBeGreaterThan(0);
  await transcript.fill("A revised chat system");
  await panel(page).getByRole("button", { name: "Close utility panel" }).click();
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Review transcript" })).toHaveValue("A revised chat system");
  await panel(page).getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel(page)).toContainText("AI-generated draft");
  await panel(page).getByRole("button", { name: "Apply to diagram" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("architekt:architecture-editor"))).not.toBeNull();
  const stored = await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"));
  expect(stored).not.toContain("A revised chat system");
});

test("permission denial and canceled pending permission preserve typed text", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const prompt = panel(page).getByRole("textbox", { name: "Describe your system" });
  await prompt.fill("Keep this text");
  await page.evaluate(() => { (window as typeof window & { __voiceMock: { mode: string } }).__voiceMock.mode = "denied"; });
  page.once("dialog", (dialog) => dialog.accept());
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("Microphone access was denied");
  await expect(prompt).toHaveValue("Keep this text");
  await page.evaluate(() => { (window as typeof window & { __voiceMock: { mode: string } }).__voiceMock.mode = "pending"; });
  page.once("dialog", (dialog) => dialog.accept());
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await expect(panel(page)).toContainText("Waiting for microphone permission");
  await panel(page).getByRole("button", { name: "Cancel recording" }).click();
  await page.evaluate(() => { (window as typeof window & { __voiceMock: { resolvePermission?: () => void } }).__voiceMock.resolvePermission?.(); });
  await expect(prompt).toHaveValue("Keep this text");
  await expect(panel(page)).not.toContainText("Recording\n");
});

test("voice controls fit the lower sheet and dark theme", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await expect(panel(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Cancel recording" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await panel(page).getByRole("button", { name: "Cancel recording" }).click();
  await expect(panel(page).getByRole("button", { name: "Generate", exact: true })).toBeVisible();
});

test("retry retains audio, long transcripts remain editable, and record again preserves text until success", async ({ page }) => {
  await installSyntheticMicrophone(page);
  let attempts = 0;
  await page.route("**/api/architecture/transcribe", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { type: "provider-unavailable", retryable: true, message: "untrusted" } }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "x".repeat(5001) }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("temporarily unavailable");
  await expect(panel(page).getByRole("alert")).not.toContainText("untrusted");
  await panel(page).getByRole("button", { name: "Retry transcription" }).click();
  const transcript = panel(page).getByRole("textbox", { name: "Review transcript" });
  await expect(transcript).toHaveValue("x".repeat(5001));
  await expect(panel(page).getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
  await expect(transcript).toHaveAttribute("aria-invalid", "true");
  await transcript.fill("Shortened transcript");
  await expect(panel(page).getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await panel(page).getByRole("button", { name: "Record again" }).click();
  await panel(page).getByRole("button", { name: "Cancel recording" }).click();
  await expect(transcript).toHaveValue("Shortened transcript");
  await panel(page).getByRole("button", { name: "Discard transcript" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Describe your system" })).toHaveValue("");
});

test("recording blocks dock exit; page hiding releases the microphone without uploading", async ({ page }) => {
  await installSyntheticMicrophone(page);
  let uploads = 0;
  await page.route("**/api/architecture/transcribe", (route) => { uploads += 1; return route.abort(); });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await expect(panel(page).getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Stop or Cancel recording first");
  await expect(panel(page).getByRole("button", { name: "Stop", exact: true })).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(panel(page).getByRole("alert")).toContainText("tab was hidden");
  expect(await page.evaluate(() => (window as typeof window & { __voiceMock: { stopped: number } }).__voiceMock.stopped)).toBeGreaterThan(0);
  expect(uploads).toBe(0);
});

test("unsupported recording leaves typed generation available", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(panel(page).getByRole("button", { name: "Speak" })).toBeDisabled();
  await expect(panel(page)).toContainText("Voice recording is unavailable here");
  await panel(page).getByRole("textbox", { name: "Describe your system" }).fill("A typed prompt");
  await expect(panel(page).getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
});

test("confirmed document replacement clears transient transcript", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.route("**/api/architecture/transcribe", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "Unpersisted voice draft" }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel(page).getByRole("textbox", { name: "Review transcript" })).toHaveValue("Unpersisted voice draft");
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  await page.getByRole("button", { name: "Import JSON" }).click();
  const document = {
    schemaVersion: 5,
    designContext: { title: "Imported", requirementsAndConstraints: "", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "" },
    graph: { components: [], connections: [], boundaries: [] },
    nodePositions: [],
  };
  await page.getByLabel("Choose Architekt JSON file").setInputFiles({ name: "import.architekt.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText("discards your current voice recording or transient transcript");
  await page.getByRole("button", { name: "Replace document" }).click();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Describe your system" })).toHaveValue("");
  await expect(panel(page)).not.toContainText("Unpersisted voice draft");
});

test("confirmed recovery Reset clears a voice draft", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.addInitScript(() => { localStorage.setItem("architekt:architecture-editor", "{invalid"); });
  await page.route("**/api/architecture/transcribe", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "Transient before reset" }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel(page).getByRole("textbox", { name: "Review transcript" })).toHaveValue("Transient before reset");
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("Voice recording and transcript work will also be discarded."); return dialog.accept(); });
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Describe your system" })).toHaveValue("");
});

test("transcription may finish with the dock closed and announces the retained transcript", async ({ page }) => {
  await installSyntheticMicrophone(page);
  let complete!: () => void;
  await page.route("**/api/architecture/transcribe", async (route) => {
    await new Promise<void>((resolve) => { complete = resolve; });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ transcript: "Background completion" }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel(page)).toContainText("Transcribing");
  await panel(page).getByRole("button", { name: "Close utility panel" }).click();
  await expect(page.getByRole("button", { name: "Generate architecture" })).toBeFocused();
  await expect.poll(() => typeof complete).toBe("function");
  complete();
  await expect(page.getByRole("status").filter({ hasText: "Transcript ready. Open Generate architecture" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate architecture" })).toBeFocused();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(panel(page).getByRole("textbox", { name: "Review transcript" })).toHaveValue("Background completion");
});

test("non-retryable transcription failure keeps the existing prompt", async ({ page }) => {
  await installSyntheticMicrophone(page);
  await page.route("**/api/architecture/transcribe", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { type: "invalid-transcription", retryable: false, message: "raw provider message" } }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const prompt = panel(page).getByRole("textbox", { name: "Describe your system" });
  await prompt.fill("Existing typed description");
  page.once("dialog", (dialog) => dialog.accept());
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await panel(page).getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("transcript could not be used");
  await expect(panel(page)).not.toContainText("raw provider message");
  await expect(panel(page).getByRole("button", { name: "Retry transcription" })).toHaveCount(0);
  await expect(prompt).toHaveValue("Existing typed description");
});
