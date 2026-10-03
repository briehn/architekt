import { expect, test, type Page } from "@playwright/test";

const titleButton = (page: Page) => page.getByRole("button", { name: /^Open Design Brief:/ });
const brief = (page: Page) => page.getByRole("complementary", { name: "Design Brief utility panel" });

async function startEmpty(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) {
      window.localStorage.setItem("architekt:architecture-editor", "{invalid");
    }
  });
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(0);
}

test("context-only brief saves, survives refresh, and remains one Undo step", async ({ page }) => {
  await startEmpty(page);
  await expect(titleButton(page)).toContainText("Untitled architecture");
  await titleButton(page).focus();
  await titleButton(page).press("Enter");
  await expect(brief(page)).toBeVisible();
  await brief(page).getByRole("textbox", { name: "Title" }).fill("Payments architecture");
  await brief(page).getByRole("textbox", { name: "Requirements & constraints" }).fill("Accept orders safely.");
  await brief(page).getByRole("textbox", { name: "Assumptions & open questions" }).fill("Peak traffic unknown.");
  await brief(page).getByRole("textbox", { name: "Decisions & tradeoffs" }).fill("Queue → isolate payment retries → synchronous calls → delayed confirmation.");
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(titleButton(page)).toContainText("Payments architecture");
  await expect(page.getByRole("status").filter({ hasText: "Design Brief saved" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(titleButton(page)).toContainText("Untitled architecture");
  await expect(brief(page).getByRole("textbox", { name: "Title" })).toHaveValue("");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(brief(page).getByRole("textbox", { name: "Title" })).toHaveValue("Payments architecture");
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem("architekt:architecture-editor") ?? "{}").designContext?.title)).toBe("Payments architecture");
  const beforeNoOp = await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"));
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(page.getByRole("status").filter({ hasText: "already up to date" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.reload();
  await expect(titleButton(page)).toContainText("Payments architecture");
  await titleButton(page).click();
  await expect(brief(page).getByRole("textbox", { name: "Requirements & constraints" })).toHaveValue("Accept orders safely.");
  await expect(brief(page).getByRole("textbox", { name: "Assumptions & open questions" })).toHaveValue("Peak traffic unknown.");
  await expect(brief(page).getByRole("textbox", { name: "Decisions & tradeoffs" })).toContainText("Queue → isolate payment retries");
  const saved = await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"));
  expect(JSON.parse(saved ?? "").graph.components).toEqual([]);
  expect(saved).toBe(beforeNoOp);
});

test("limits validate without truncating title or narrative text", async ({ page }) => {
  await page.goto("/");
  await titleButton(page).click();
  const title = brief(page).getByRole("textbox", { name: "Title" });
  const requirements = brief(page).getByRole("textbox", { name: "Requirements & constraints" });
  await title.fill("x".repeat(120));
  await requirements.fill("a".repeat(5000));
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(titleButton(page)).toContainText("x".repeat(120));
  await title.fill("x".repeat(121));
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(title).toHaveValue("x".repeat(121));
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(brief(page).getByRole("alert")).toContainText("Title is too long");
  await title.fill("Valid");
  await requirements.fill("a".repeat(5001));
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(requirements).toHaveValue("a".repeat(5001));
  await expect(requirements).toHaveAttribute("aria-invalid", "true");
  await expect(brief(page).getByRole("alert")).toContainText("Requirements & constraints is too long");
  await page.reload();
  await expect(titleButton(page)).toContainText("x".repeat(120));
});

test("dirty draft requires explicit discard for close, switch, and Escape; Cancel is local", async ({ page }) => {
  await page.goto("/");
  await titleButton(page).click();
  const title = brief(page).getByRole("textbox", { name: "Title" });
  await title.fill("Draft title");
  page.once("dialog", (dialog) => dialog.dismiss());
  await brief(page).getByRole("button", { name: "Close utility panel" }).click();
  await expect(title).toHaveValue("Draft title");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(brief(page)).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await title.press("Escape");
  await expect(brief(page)).toBeVisible();
  await brief(page).getByRole("button", { name: "Cancel" }).click();
  await expect(title).toHaveValue("");
  await title.press("Escape");
  await expect(brief(page)).toHaveCount(0);
  await expect(titleButton(page)).toBeFocused();
  await titleButton(page).click();
  await expect(brief(page)).toBeVisible();
  await title.fill("Discard this");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Analysis utility panel" })).toBeVisible();
  await expect(titleButton(page)).toContainText("Untitled architecture");
});

test("external Undo/Redo refreshes clean drafts and protects dirty drafts", async ({ page }) => {
  await page.goto("/");
  await titleButton(page).click();
  const title = brief(page).getByRole("textbox", { name: "Title" });
  await title.fill("First title");
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(title).toHaveValue("");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(title).toHaveValue("First title");
  await title.fill("Unsaved alternative");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(title).toHaveValue("Unsaved alternative");
  await expect(brief(page).getByRole("alert")).toContainText("saved Design Brief changed");
  await expect(brief(page).getByRole("button", { name: "Save brief" })).toBeDisabled();
  await brief(page).getByRole("button", { name: "Keep my draft" }).click();
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(titleButton(page)).toContainText("Unsaved alternative");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(title).toHaveValue("");
  await title.fill("Another unsaved draft");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(title).toHaveValue("Another unsaved draft");
  await brief(page).getByRole("button", { name: "Load saved brief" }).click();
  await expect(title).toHaveValue("Unsaved alternative");
});

test("narrow dark brief stays in the lower sheet with no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await titleButton(page).click();
  await expect(brief(page)).toBeVisible();
  const canvas = await page.locator(".workbench-canvas").boundingBox();
  const dock = await brief(page).boundingBox();
  expect(canvas && dock).toBeTruthy();
  if (!canvas || !dock) return;
  expect(dock.y).toBeGreaterThan(canvas.y + canvas.height / 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await brief(page).getByRole("textbox", { name: "Decisions & tradeoffs" }).fill("Tradeoff notes");
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await expect(brief(page).getByRole("textbox", { name: "Decisions & tradeoffs" })).toHaveValue("Tradeoff notes");
  await brief(page).getByRole("textbox", { name: "Title" }).fill("Unsaved mobile title");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(brief(page)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Creation library" })).toBeVisible();
  await expect(titleButton(page)).toContainText("Untitled architecture");
});

test("a confirmed recovery Reset discards a dirty brief draft", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) window.localStorage.setItem("architekt:architecture-editor", "{invalid");
  });
  await page.goto("/");
  await titleButton(page).click();
  await brief(page).getByRole("textbox", { name: "Title" }).fill("Unsaved recovery draft");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("unsaved Design Brief draft");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await expect(brief(page).getByRole("textbox", { name: "Title" })).toHaveValue("Unsaved recovery draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await expect(brief(page)).toHaveCount(0);
  await expect(titleButton(page)).toContainText("Untitled architecture");
  await page.reload();
  await expect(titleButton(page)).toContainText("Untitled architecture");
});

test("AI review keeps the Design Brief across Discard, Apply, and Undo", async ({ page }) => {
  await page.route("**/api/architecture/generate", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      components: [
        { ref: "client", name: "Client", kind: "client" },
        { ref: "api", name: "API", kind: "service" },
        { ref: "db", name: "Database", kind: "database" },
      ],
      connections: [
        { sourceRef: "client", targetRef: "api", kind: "request-response" },
        { sourceRef: "api", targetRef: "db", kind: "data-access" },
      ],
      summary: "A small application with a client, API, and database.",
      assumptions: [],
    }),
  }));
  await page.goto("/");
  await titleButton(page).click();
  await brief(page).getByRole("textbox", { name: "Title" }).fill("My brief");
  await brief(page).getByRole("textbox", { name: "Requirements & constraints" }).fill("Reliable orders");
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await page.getByRole("textbox", { name: "Describe your system" }).fill("An order system");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Your Design Brief will be kept. Review it against the new architecture after Apply.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(titleButton(page)).toContainText("My brief");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "Apply to diagram" }).click();
  await expect(titleButton(page)).toContainText("My brief");
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(titleButton(page)).toContainText("My brief");
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(2);
  await titleButton(page).click();
  await expect(brief(page).getByRole("textbox", { name: "Requirements & constraints" })).toHaveValue("Reliable orders");
});

test("AI error and Cancel leave a saved brief untouched", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/architecture/generate", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { type: "provider-unavailable", retryable: true, message: "Provider unavailable" } }) });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { type: "provider-unavailable", retryable: true, message: "Provider unavailable" } }) });
    } catch {
      // The browser can close the aborted request before the mock responds.
    }
  });
  await page.goto("/");
  await titleButton(page).click();
  await brief(page).getByRole("textbox", { name: "Title" }).fill("Saved brief");
  await brief(page).getByRole("button", { name: "Save brief" }).click();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await page.getByRole("textbox", { name: "Describe your system" }).fill("A simple service");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "AI utility panel" }).getByRole("alert")).toContainText("temporarily unavailable");
  await expect(titleButton(page)).toContainText("Saved brief");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeVisible();
  await expect(titleButton(page)).toContainText("Saved brief");
  await expect(page.getByText("AI-generated draft")).toHaveCount(0);
});

test("node and boundary drag transactions disable Save without losing the draft", async ({ page }) => {
  await page.goto("/");
  await titleButton(page).click();
  const title = brief(page).getByRole("textbox", { name: "Title" });
  await title.fill("Draft during drag");
  const node = page.locator(".react-flow__node-architekt").first();
  const nodeBox = await node.boundingBox();
  expect(nodeBox).toBeTruthy();
  if (!nodeBox) return;
  await page.mouse.move(nodeBox.x + 50, nodeBox.y + 25);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + 70, nodeBox.y + 35, { steps: 5 });
  await expect(brief(page).getByRole("button", { name: "Save brief" })).toBeDisabled();
  await expect(title).toHaveValue("Draft during drag");
  await page.mouse.up();
  await expect(brief(page).getByRole("button", { name: "Save brief" })).toBeEnabled();
  await brief(page).getByRole("button", { name: "Save brief" }).click();

  await page.getByRole("button", { name: "Create boundary" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Core");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Create boundary", exact: true }).last().click();
  await titleButton(page).click();
  await brief(page).getByRole("textbox", { name: "Title" }).fill("Second draft");
  const boundaryBox = await page.locator(".architekt-boundary__header").boundingBox();
  expect(boundaryBox).toBeTruthy();
  if (!boundaryBox) return;
  await page.mouse.move(boundaryBox.x + 20, boundaryBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(boundaryBox.x + 40, boundaryBox.y + 22, { steps: 5 });
  await expect(brief(page).getByRole("button", { name: "Save brief" })).toBeDisabled();
  await expect(brief(page).getByRole("textbox", { name: "Title" })).toHaveValue("Second draft");
  await page.mouse.up();
  await expect(brief(page).getByRole("button", { name: "Save brief" })).toBeEnabled();
});
