import { expect, test } from "@playwright/test";

test("editing, history, Structure, and Fit view work together", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Architekt" })).toBeVisible();
  const initialNodes = await page.locator(".react-flow__node-architekt").count();

  await page.getByRole("button", { name: "Add Service component" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(initialNodes + 1);

  const viewport = page.locator(".react-flow__viewport");
  const transformBeforeZoom = await viewport.getAttribute("style");
  await page.locator(".workbench-canvas").hover({ position: { x: 80, y: 80 } });
  await page.mouse.wheel(0, -600);
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(transformBeforeZoom);
  const transformAfterZoom = await viewport.getAttribute("style");

  const fitView = page.getByRole("button", { name: "Fit view" });
  await fitView.focus();
  await expect(fitView).toBeFocused();
  await fitView.press("Enter");
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(transformAfterZoom);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(initialNodes);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(initialNodes + 1);

  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Structure utility panel" })).toBeVisible();
  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(initialNodes + 1);
});

test("an accepted edit survives an immediate refresh", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Queue component" })).toBeVisible();
  await page.getByRole("button", { name: "Add Queue component" }).click();
  await page.reload();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(3);
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rename Queue" })).toBeVisible();
});

test("Fit view includes a boundary on a narrow canvas with Structure open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Create boundary" }).click();
  const form = page.locator("form").filter({ has: page.locator("#boundary-create-name") });
  await form.getByRole("textbox", { name: "Name" }).fill("Data path");
  await form.getByRole("checkbox").first().check();
  await form.getByRole("checkbox").nth(1).check();
  await form.getByRole("button", { name: "Create boundary" }).click();
  await expect(page.locator(".react-flow__node-boundary")).toHaveCount(1);

  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await page.getByRole("button", { name: "Fit view" }).click();
  const boundary = await page.locator(".react-flow__node-boundary").boundingBox();
  const canvas = await page.locator(".workbench-canvas").boundingBox();
  const dock = await page.locator(".workbench-dock").boundingBox();
  expect(boundary && canvas && dock).toBeTruthy();
  if (!boundary || !canvas || !dock) return;
  expect(boundary.x).toBeGreaterThanOrEqual(canvas.x);
  expect(boundary.x + boundary.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(boundary.y).toBeGreaterThanOrEqual(canvas.y);
  expect(boundary.y + boundary.height).toBeLessThanOrEqual(dock.y);
});

test("a failed local write keeps the edit available for Retry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add Cache component" })).toBeVisible();
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    (window as Window & { restoreStorageWrite?: () => void }).restoreStorageWrite = () => {
      Storage.prototype.setItem = originalSetItem;
    };
    Storage.prototype.setItem = () => { throw new Error("Storage unavailable"); };
  });

  await page.getByRole("button", { name: "Add Cache component" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Changes are not saved." })).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { restoreStorageWrite?: () => void }).restoreStorageWrite?.();
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Changes are not saved." })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Structure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rename Cache" })).toBeVisible();
});

test("recovery Reset creates a durable empty V5 document", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) {
      window.localStorage.setItem("architekt:architecture-editor", "{invalid");
    }
  });
  await page.goto("/");
  const reset = page.getByRole("button", { name: "Reset saved workspace" });
  await expect(reset).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await reset.click();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(0);
  const saved = await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"));
  expect(JSON.parse(saved ?? "")).toMatchObject({
    schemaVersion: 5,
    designContext: {
      title: "", requirementsAndConstraints: "", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "",
    },
    graph: { components: [], connections: [], boundaries: [] },
    nodePositions: [],
  });
});
