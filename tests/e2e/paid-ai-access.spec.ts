import { expect, test } from "@playwright/test";

const proposal = { components: [{ ref: "api", name: "API Service", kind: "service" }], connections: [],
  summary: "A small service.", assumptions: [] };

test("public editor remains usable; invite enables Generate; denial and logout preserve the document", async ({ page }) => {
  let access: "access-required" | "enabled" = "access-required";
  let generateRequests = 0;
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: access }) }));
  await page.route("**/api/ai-access/redeem", async (route) => {
    const code = route.request().postDataJSON().inviteCode;
    if (code === "valid-demo-code") { access = "enabled"; return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"enabled"}' }); }
    return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":{"type":"invalid-or-expired-access"}}' });
  });
  await page.route("**/api/ai-access/logout", (route) => { access = "access-required"; return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"cleared"}' }); });
  await page.route("**/api/architecture/generate", (route) => {
    generateRequests++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(proposal) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add Service component" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const dock = page.getByRole("complementary", { name: "AI utility panel" });
  await expect(dock.getByText("Enable AI access with a demo code.")).toBeVisible();
  await dock.getByRole("textbox", { name: "Describe your system" }).fill("A small service");
  await expect(dock.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
  await expect(dock.getByRole("button", { name: "Speak" })).toBeDisabled();
  expect(generateRequests).toBe(0);
  await dock.getByRole("textbox", { name: "Demo code" }).fill("invalid");
  await dock.getByRole("button", { name: "Enable AI access" }).click();
  await expect(dock.getByText("This demo code is invalid or no longer available.")).toBeVisible();
  await expect(dock.getByRole("textbox", { name: "Demo code" })).toHaveValue("");
  await dock.getByRole("textbox", { name: "Demo code" }).fill("valid-demo-code");
  await dock.getByRole("textbox", { name: "Demo code" }).press("Tab");
  await expect(dock.getByRole("button", { name: "Enable AI access" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dock.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  await expect(dock.getByRole("button", { name: "Disable AI access on this browser" })).toBeFocused();
  await expect(dock.getByRole("textbox", { name: "Describe your system" })).toHaveValue("A small service");
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain("valid-demo-code");
  await page.reload();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(page.getByRole("complementary", { name: "AI utility panel" }).getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
  await dock.getByRole("textbox", { name: "Describe your system" }).fill("A small service");
  await dock.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(dock.getByRole("heading", { name: "AI-generated draft" })).toBeVisible();
  expect(generateRequests).toBe(1);
  await dock.getByRole("button", { name: "Discard" }).click();
  await dock.getByRole("button", { name: "Disable AI access on this browser" }).click();
  await expect(dock.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
  await expect(dock.getByRole("textbox", { name: "Demo code" })).toBeFocused();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("narrow dark Workbench keeps access UI and manual actions usable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"access-required"}' }));
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dock = page.getByRole("complementary", { name: "Review utility panel" });
  await expect(dock.getByRole("textbox", { name: "Demo code" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Review architecture" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Analysis utility panel" })).toBeVisible();
});

test("a paid admission denial updates access guidance without erasing the prompt", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"enabled"}' }));
  await page.route("**/api/architecture/generate", (route) => {
    calls++;
    return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: {
      type: "concurrency-limited", message: "unsafe server copy" } }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const dock = page.getByRole("complementary", { name: "AI utility panel" });
  await dock.getByRole("textbox", { name: "Describe your system" }).fill("An order service");
  await dock.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(dock.getByText("Another AI request is running, or requests are arriving too quickly. Try again shortly.")).toBeVisible();
  await expect(dock.getByRole("textbox", { name: "Describe your system" })).toHaveValue("An order service");
  expect(calls).toBe(1);
  await expect(dock).not.toContainText("unsafe server copy");
});

test("missing access never requests the microphone", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __micRequests?: number };
    state.__micRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: async () => { state.__micRequests!++; throw new Error("No microphone should be requested"); },
    } });
  });
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"access-required"}' }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await expect(page.getByRole("complementary", { name: "AI utility panel" }).getByRole("button", { name: "Speak" })).toBeDisabled();
  expect(await page.evaluate(() => (window as typeof window & { __micRequests?: number }).__micRequests)).toBe(0);
});

test("Review requires access, then an enabled session can request a grounded draft", async ({ page }) => {
  let access: "access-required" | "enabled" = "access-required";
  let reviewRequests = 0;
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: access }) }));
  await page.route("**/api/ai-access/redeem", (route) => { access = "enabled"; return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"enabled"}' }); });
  await page.route("**/api/architecture/review", (route) => {
    reviewRequests++;
    const component = route.request().postDataJSON().graph.components[0];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: {
      modeledFacts: [{ evidence: { type: "component", id: component.id }, text: "A modeled component." }],
      statedContext: [], tradeoffs: [], questions: [{ question: "What traffic is expected?", evidence: [{ type: "component", id: component.id }] }],
    } }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dock = page.getByRole("complementary", { name: "Review utility panel" });
  await expect(dock.getByRole("button", { name: "Review architecture" })).toBeDisabled();
  expect(reviewRequests).toBe(0);
  await dock.getByRole("textbox", { name: "Demo code" }).fill("valid-demo-code");
  await dock.getByRole("button", { name: "Enable AI access" }).click();
  await expect(dock.getByRole("button", { name: "Review architecture" })).toBeEnabled();
  await dock.getByRole("button", { name: "Review architecture" }).click();
  await expect(dock.getByText("A modeled component.")).toBeVisible();
  expect(reviewRequests).toBe(1);
});

test("quota and global denials keep manual document export available", async ({ page }) => {
  let denial: "grant-allowance-exhausted" | "global-ai-disabled" = "grant-allowance-exhausted";
  await page.route("**/api/ai-access/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"enabled"}' }));
  await page.route("**/api/architecture/generate", (route) => route.fulfill({ status: denial === "grant-allowance-exhausted" ? 429 : 503,
    contentType: "application/json", body: JSON.stringify({ error: { type: denial, message: "unsafe internal detail" } }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Generate architecture" }).click();
  const dock = page.getByRole("complementary", { name: "AI utility panel" });
  await dock.getByRole("textbox", { name: "Describe your system" }).fill("An order service");
  await dock.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(dock.getByText("Your demo AI allowance has been used.")).toBeVisible();
  denial = "global-ai-disabled";
  await dock.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(dock.getByText("AI features are temporarily unavailable.")).toBeVisible();
  await expect(dock.getByRole("textbox", { name: "Describe your system" })).toHaveValue("An order service");
  await expect(dock).not.toContainText("unsafe internal detail");
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.architekt\.json$/);
});
