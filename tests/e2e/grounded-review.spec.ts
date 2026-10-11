import { expect, test, type Page } from "@playwright/test";

const dock = (page: Page) => page.getByRole("complementary", { name: "Review utility panel" });

async function mockReview(page: Page) {
  let requests = 0;
  await page.route("**/api/architecture/review", async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body).toHaveProperty("version", 1);
    expect(body).toHaveProperty("graph.components");
    expect(body).toHaveProperty("designContext.title");
    expect(JSON.stringify(body)).not.toMatch(/position|analysis|selection|viewport|voice|history|snapshot/i);
    const component = body.graph.components[0];
    const review = {
      modeledFacts: [{ evidence: { type: "component", id: component.id }, text: `${component.name} is modeled as a Service.` }],
      statedContext: body.designContext.title ? [{ evidence: { type: "design-context", field: "title" }, excerpt: body.designContext.title }] : [],
      tradeoffs: [{ condition: "traffic rises", benefit: "additional capacity may help", downside: "cost may increase", evidence: [{ type: "component", id: component.id }] }],
      questions: [{ question: "What traffic is expected?", evidence: [{ type: "design-context", field: "assumptionsAndOpenQuestions" }] }],
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review }) });
  });
  return () => requests;
}

test("explicit review, evidence, staleness, history, layout, dock retention, and refresh", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const requests = await mockReview(page);
  await page.goto("/");
  const storedBefore = await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"));
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByRole("heading", { name: "Grounded review" })).toBeVisible();
  await expect(dock(page)).toContainText("Sends the modeled architecture and saved Design Brief to OpenAI for an advisory review.");
  expect(requests()).toBe(0);
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toBeVisible();
  for (const heading of ["Design Brief context", "Possible tradeoffs", "Questions to resolve"]) await expect(dock(page).getByRole("heading", { name: heading })).toBeVisible();
  await dock(page).getByText("Evidence", { exact: true }).first().click();
  await expect(dock(page).locator("details").first()).toHaveAttribute("open", "");
  expect(requests()).toBe(1);
  expect(await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"))).toBe(storedBefore);
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Analysis utility panel" })).toBeVisible();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toBeVisible();
  await page.getByRole("button", { name: "Auto-layout" }).click();
  await expect(dock(page).getByText("This review was generated from an earlier version")).toHaveCount(0);
  await page.getByRole("button", { name: "Add Service component" }).click();
  await expect(dock(page)).toContainText("This review was generated from an earlier version of the architecture.");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(dock(page).getByText("This review was generated from an earlier version")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(dock(page)).toContainText("This review was generated from an earlier version");
  await dock(page).getByRole("button", { name: "Review again" }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toBeVisible();
  expect(requests()).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toHaveCount(0);
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeVisible();
});

test("cancel, failure, and failed rerun retain the last completed result", async ({ page }) => {
  let mode: "pending" | "success" | "failure" = "pending";
  let requestCount = 0;
  await page.route("**/api/architecture/review", async (route) => {
    requestCount++;
    if (mode === "pending") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return route.abort("failed").catch(() => {});
    }
    if (mode === "failure") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { type: "provider-unavailable", message: "unsafe raw text" } }) });
    const component = route.request().postDataJSON().graph.components[0];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: {
      modeledFacts: [{ evidence: { type: "component", id: component.id }, text: "A modeled component." }],
      statedContext: [], tradeoffs: [], questions: [{ question: "What traffic is expected?", evidence: [{ type: "component", id: component.id }] }],
    } }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  await expect(dock(page).getByRole("status", { name: "" }).filter({ hasText: "Reviewing architecture" })).toBeVisible();
  await dock(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeVisible();
  mode = "success";
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  await expect(dock(page).getByText("A modeled component.")).toBeVisible();
  mode = "failure";
  await dock(page).getByRole("button", { name: "Review again" }).click();
  await expect(dock(page).getByRole("alert")).toContainText("temporarily unavailable");
  await expect(dock(page).getByText("A modeled component.")).toBeVisible();
  expect(requestCount).toBe(3);
  await dock(page).getByRole("button", { name: "Discard review" }).click();
  await expect(dock(page).getByText("A modeled component.")).toHaveCount(0);
});

test("empty architecture and dirty brief block review; narrow dark dock fits", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) window.localStorage.setItem("architekt:architecture-editor", "{invalid");
  });
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeDisabled();
  await expect(dock(page)).toContainText("Add at least one component to review this architecture.");
  await page.getByRole("button", { name: "Open Design Brief: Untitled architecture" }).click();
  const brief = page.getByRole("complementary", { name: "Design Brief utility panel" });
  await brief.getByRole("textbox", { name: "Title" }).fill("Unsaved draft");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(brief).toContainText("Save or Cancel your Design Brief draft before reviewing.");
  await expect(brief.getByRole("textbox", { name: "Title" })).toHaveValue("Unsaved draft");
  await brief.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page)).toBeVisible();
  expect(await dock(page).evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("successful portable replacement clears review; Undo does not resurrect it", async ({ page }) => {
  await mockReview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toBeVisible();
  const importDocument = {
    schemaVersion: 5,
    designContext: { title: "Imported", requirementsAndConstraints: "", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "" },
    graph: { components: [{ id: "new", name: "New service", kind: "service" }], connections: [], boundaries: [] },
    nodePositions: [{ componentId: "new", x: 10, y: 20 }],
  };
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.getByLabel("Choose Architekt JSON file").setInputFiles({ name: "new.architekt.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(importDocument)) });
  await page.getByRole("button", { name: "Replace document" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toHaveCount(0);
});

test("AI Apply preserves the old review as stale without changing its evidence", async ({ page }) => {
  await mockReview(page);
  await page.route("**/api/architecture/generate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    components: [{ ref: "new", name: "New API", kind: "service" }], connections: [], summary: "A new modeled service.", assumptions: [],
  }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  const oldFact = await dock(page).locator("#review-modeled-facts + ul li p").first().textContent();
  await page.getByRole("button", { name: "Generate architecture" }).click();
  await page.getByRole("textbox", { name: "Describe your system" }).fill("A new system");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.getByRole("button", { name: "Apply to diagram" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page)).toContainText("This review was generated from an earlier version of the architecture.");
  await expect(dock(page).locator("#review-modeled-facts + ul li p").first()).toHaveText(oldFact ?? "");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(dock(page).getByText("This review was generated from an earlier version")).toHaveCount(0);
});

test("full Reset clears a completed review and keyboard controls restore focus", async ({ page }) => {
  await mockReview(page);
  await page.addInitScript(() => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) window.localStorage.setItem("architekt:architecture-editor", "{invalid");
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Review", exact: true });
  await trigger.focus();
  await trigger.press("Enter");
  const action = dock(page).getByRole("button", { name: "Review architecture" });
  await action.focus();
  await action.press("Enter");
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toBeVisible();
  await dock(page).getByRole("button", { name: "Close utility panel" }).click();
  await expect(trigger).toBeFocused();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset saved workspace" }).click();
  await trigger.click();
  await expect(dock(page).getByRole("heading", { name: "Modeled facts" })).toHaveCount(0);
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeDisabled();
});

test("drag and inline rename block requests; pan and selection do not", async ({ page }) => {
  const requests = await mockReview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const action = dock(page).getByRole("button", { name: "Review architecture" });
  const nodeBox = await page.locator(".react-flow__node-architekt").first().boundingBox();
  expect(nodeBox).toBeTruthy();
  await page.mouse.move(nodeBox!.x + 50, nodeBox!.y + 25);
  await page.mouse.down();
  await page.mouse.move(nodeBox!.x + 70, nodeBox!.y + 35, { steps: 5 });
  await expect(action).toBeDisabled();
  expect(requests()).toBe(0);
  await page.mouse.up();
  await expect(action).toBeEnabled();
  await page.locator(".react-flow__node-architekt").first().dblclick();
  await expect(page.getByRole("textbox", { name: "Rename component" })).toBeVisible();
  await expect(action).toBeDisabled();
  await page.getByRole("textbox", { name: "Rename component" }).press("Escape");
  await expect(action).toBeEnabled();
  await page.locator(".workbench-canvas").hover({ position: { x: 80, y: 80 } });
  await page.mouse.wheel(0, -300);
  await expect(action).toBeEnabled();
  await page.getByRole("button", { name: "Create boundary" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Core");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Create boundary", exact: true }).last().click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const header = await page.locator(".architekt-boundary__header").boundingBox();
  expect(header).toBeTruthy();
  await page.mouse.move(header!.x + 20, header!.y + 12);
  await page.mouse.down();
  await page.mouse.move(header!.x + 40, header!.y + 22, { steps: 5 });
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeDisabled();
  await page.mouse.up();
  await expect(dock(page).getByRole("button", { name: "Review architecture" })).toBeEnabled();
  expect(requests()).toBe(0);
});

test("a review may finish with Analysis open and announces readiness without taking focus", async ({ page }) => {
  await page.route("**/api/architecture/review", async (route) => {
    const component = route.request().postDataJSON().graph.components[0];
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ review: {
      modeledFacts: [{ evidence: { type: "component", id: component.id }, text: "A modeled component." }],
      statedContext: [], tradeoffs: [], questions: [{ question: "What traffic is expected?", evidence: [{ type: "component", id: component.id }] }],
    } }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await dock(page).getByRole("button", { name: "Review architecture" }).click();
  const analysisTrigger = page.getByRole("button", { name: "Analysis", exact: true });
  await analysisTrigger.click();
  await expect(page.getByRole("complementary", { name: "Analysis utility panel" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Grounded review ready. Open Review to inspect it." })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Analysis utility panel" }).getByRole("button", { name: "Close utility panel" })).toBeFocused();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dock(page).getByText("A modeled component.")).toBeVisible();
});
