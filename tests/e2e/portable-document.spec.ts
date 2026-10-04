import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const source = {
  schemaVersion: 5,
  designContext: { title: "Source A", requirementsAndConstraints: "Keep orders durable", assumptionsAndOpenQuestions: "Traffic unknown", decisionsAndTradeoffs: "Queue adds delay" },
  graph: {
    components: [{ id: "api", name: "API", kind: "service" }, { id: "db", name: "Database", kind: "database" }],
    connections: [{ id: "data", sourceComponentId: "api", targetComponentId: "db", kind: "data-access" }],
    boundaries: [{ id: "core", name: "Core", memberComponentIds: ["api"] }],
  },
  nodePositions: [{ componentId: "api", x: 34, y: 48 }, { componentId: "db", x: 407, y: 115 }],
};

const imported = {
  schemaVersion: 5,
  designContext: { title: "Imported B", requirementsAndConstraints: "Share files", assumptionsAndOpenQuestions: "Storage target unknown", decisionsAndTradeoffs: "Object storage requires cleanup" },
  graph: {
    components: [{ id: "client", name: "Browser", kind: "client" }],
    connections: [],
    boundaries: [{ id: "future", name: "Future", memberComponentIds: [] }],
  },
  nodePositions: [{ componentId: "client", x: -19, y: 88 }],
};

async function openSource(page: Page) {
  await page.addInitScript((document) => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) {
      window.localStorage.setItem("architekt:architecture-editor", JSON.stringify(document));
    }
  }, source);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
}

async function chooseDocument(page: Page, document: unknown, name = "import.architekt.json") {
  await page.getByLabel("Choose Architekt JSON file").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
}

async function openImport(page: Page) {
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByRole("complementary", { name: "Import document utility panel" })).toBeVisible();
}

test("downloads a complete V5 JSON document with a safe titled filename", async ({ page }) => {
  await openSource(page);
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("source-a.architekt.json");
  const path = await download.path();
  expect(path).toBeTruthy();
  const json = await readFile(path!, "utf8");
  expect(json).toContain("\n  \"schemaVersion\": 5");
  expect(JSON.parse(json)).toEqual(source);
  expect(json).not.toMatch(/nodeMeasurements|history|viewport|selection|prompt|proposal|findings/);
  await expect(page.getByRole("status").filter({ hasText: "JSON download started" })).toBeVisible();
});

test("untitled export uses the fallback filename without writing a title", async ({ page }) => {
  await page.addInitScript((document) => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) window.localStorage.setItem("architekt:architecture-editor", JSON.stringify(document));
  }, { ...source, designContext: { ...source.designContext, title: "" } });
  await page.goto("/");
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("architecture.architekt.json");
  expect(JSON.parse(await readFile((await download.path())!, "utf8")).designContext.title).toBe("");
});

test("preview Cancel is inert; Replace is one full-document Undo step and autosaves", async ({ page }) => {
  await openSource(page);
  await openImport(page);
  await chooseDocument(page, imported);
  const preview = page.getByRole("region", { name: "Import preview" });
  await expect(preview).toContainText("Imported B");
  await expect(preview.locator("dd").nth(0)).toHaveText("1");
  await expect(preview.locator("dd").nth(2)).toHaveText("1");
  await expect(preview).toContainText("You can Undo this replacement.");
  await page.getByRole("button", { name: "Cancel import" }).focus();
  await page.getByRole("button", { name: "Cancel import" }).press("Enter");
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeFocused();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(2);
  await openImport(page);
  await chooseDocument(page, imported);
  await page.getByRole("button", { name: "Replace document" }).focus();
  await page.getByRole("button", { name: "Replace document" }).press("Enter");
  await expect(page.getByRole("button", { name: "Open Design Brief: Imported B" })).toBeFocused();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(1);
  await expect(page.locator(".react-flow__node-boundary")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(2);
  await expect(page.locator(".react-flow__node-boundary")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("button", { name: "Open Design Brief: Imported B" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Open Design Brief: Imported B" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem("architekt:architecture-editor") ?? "{}"));
  expect(stored).toEqual(imported);
});

test("invalid JSON, invalid records, and oversize files never replace the current document", async ({ page }) => {
  await openSource(page);
  await openImport(page);
  const file = page.getByLabel("Choose Architekt JSON file");
  await file.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("complementary", { name: "Import document utility panel" }).getByRole("alert")).toContainText("not valid JSON");
  await chooseDocument(page, { ...imported, graph: { ...imported.graph, components: [{ ...imported.graph.components[0], kind: "not-a-kind" }] } });
  await expect(page.getByRole("complementary", { name: "Import document utility panel" }).getByRole("alert")).toContainText("invalid");
  await file.setInputFiles({ name: "huge.json", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) });
  await expect(page.getByRole("complementary", { name: "Import document utility panel" }).getByRole("alert")).toContainText("too large");
  await expect(page.getByRole("button", { name: "Replace document" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("imports a historical V3 document through the same migration path", async ({ page }) => {
  await openSource(page);
  await openImport(page);
  const legacy = { schemaVersion: 3, graph: { components: [{ id: "legacy", name: "Legacy API", kind: "service" }], connections: [] }, nodePositions: [{ componentId: "legacy", x: 212, y: -34 }] };
  await chooseDocument(page, legacy);
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText("Version 3 will be migrated");
  await expect(page.getByRole("region", { name: "Import preview" })).toContainText("Untitled architecture");
  await page.getByRole("button", { name: "Replace document" }).click();
  const stored = await page.evaluate(() => window.localStorage.getItem("architekt:architecture-editor"));
  await expect(page.getByRole("button", { name: "Open Design Brief: Untitled architecture" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(window.localStorage.getItem("architekt:architecture-editor") ?? "{}").schemaVersion)).toBe(5);
  expect(JSON.parse(stored ?? "{}").schemaVersion).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
});

test("a dirty brief must be resolved before starting import", async ({ page }) => {
  await openSource(page);
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Unsaved draft");
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Unsaved draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByRole("complementary", { name: "Import document utility panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
});

test("dark narrow preview fits the existing sheet and guarded drag cannot replace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await openSource(page);
  await openImport(page);
  await chooseDocument(page, { ...imported, designContext: { ...imported.designContext, title: "A very long imported architecture title that should wrap safely without widening the viewport" } });
  const preview = page.getByRole("region", { name: "Import preview" });
  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace document" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const canvas = await page.locator(".workbench-canvas").boundingBox();
  const dock = await page.getByRole("complementary", { name: "Import document utility panel" }).boundingBox();
  expect(canvas && dock).toBeTruthy();
  if (!canvas || !dock) return;
  expect(dock.y).toBeGreaterThan(canvas.y + canvas.height / 2);
  const header = await page.locator(".architekt-boundary__header").boundingBox();
  expect(header).toBeTruthy();
  if (!header) return;
  await page.mouse.move(header.x + 20, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(header.x + 40, header.y + 22, { steps: 5 });
  await expect(page.getByRole("button", { name: "Replace document" })).toBeDisabled();
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Replace document" })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(page.getByRole("button", { name: "Open Design Brief: Source A" })).toBeVisible();
});

test("downloads readable Markdown from committed state without editing the workspace", async ({ page }) => {
  await openSource(page);
  const beforeStorage = await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"));
  const beforeViewport = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      document.documentElement.dataset.downloadMime = blob instanceof Blob ? blob.type : "";
      return original(blob);
    };
  });
  await page.getByRole("button", { name: "Open Design Brief: Source A" }).click();
  const markdownButton = page.getByRole("button", { name: "Export Markdown" });
  await markdownButton.focus();
  const firstDownloadPromise = page.waitForEvent("download");
  await markdownButton.press("Enter");
  const firstDownload = await firstDownloadPromise;
  expect(firstDownload.suggestedFilename()).toBe("source-a.md");
  const firstPath = await firstDownload.path();
  expect(firstPath).toBeTruthy();
  const markdown = await readFile(firstPath!, "utf8");
  expect(markdown).toContain("# Source A\n\n## Overview");
  expect(markdown).toContain("- Components: 2\n- Connections: 1\n- Boundaries: 1");
  expect(markdown).toContain("## Requirements and constraints\n\nKeep orders durable");
  expect(markdown).toContain("### Core\n\n- API");
  expect(markdown).toContain("- API → Database — Data access");
  expect(markdown).not.toMatch(/nodePositions|history|viewport|selection|prompt|proposal|findings|voice/);
  expect(await page.locator("html").getAttribute("data-download-mime")).toBe("text/markdown;charset=utf-8");
  await expect(page.getByRole("status").filter({ hasText: "Markdown download started" })).toBeVisible();
  await expect(markdownButton).toBeFocused();
  const secondDownloadPromise = page.waitForEvent("download");
  await markdownButton.click();
  const secondDownload = await secondDownloadPromise;
  expect(secondDownload.suggestedFilename()).toBe("source-a.md");
  expect(await readFile((await secondDownload.path())!, "utf8")).toBe(markdown);
  expect(await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"))).toBe(beforeStorage);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(beforeViewport);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("Markdown export waits for a clean brief and an idle diagram", async ({ page }) => {
  await openSource(page);
  await page.getByRole("button", { name: "Open Design Brief: Source A" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Unsaved draft");
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeEnabled();
  const header = await page.locator(".architekt-boundary__header").boundingBox();
  expect(header).toBeTruthy();
  if (!header) return;
  await page.mouse.move(header.x + 20, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(header.x + 40, header.y + 22, { steps: 5 });
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeEnabled();
});

test("Markdown download failure reports an error and revokes its URL", async ({ page }) => {
  await openSource(page);
  const beforeStorage = await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"));
  await page.getByRole("button", { name: "Open Design Brief: Source A" }).click();
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      document.documentElement.dataset.createdUrl = url;
      return url;
    };
    URL.revokeObjectURL = (url) => {
      document.documentElement.dataset.revokedUrl = url;
      revoke(url);
    };
    HTMLAnchorElement.prototype.click = function () { throw new Error("download blocked"); };
  });
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(page.getByRole("complementary", { name: "Design Brief utility panel" }).getByRole("alert")).toContainText("Could not export Markdown. Try again.");
  expect(await page.locator("html").getAttribute("data-created-url")).toBeTruthy();
  expect(await page.locator("html").getAttribute("data-revoked-url")).toBe(await page.locator("html").getAttribute("data-created-url"));
  await expect(page.locator("body > a[download]")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"))).toBe(beforeStorage);
});

test("Markdown actions fit the dark narrow sheet and context-only documents export", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const contextOnly = { ...source, graph: { components: [], connections: [], boundaries: [] }, nodePositions: [] };
  await page.addInitScript((document) => {
    if (window.localStorage.getItem("architekt:architecture-editor") === null) window.localStorage.setItem("architekt:architecture-editor", JSON.stringify(document));
  }, contextOnly);
  await page.goto("/");
  await page.getByRole("button", { name: "Open Design Brief: Source A" }).click();
  const button = page.getByRole("button", { name: "Export Markdown" });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const canvas = await page.locator(".workbench-canvas").boundingBox();
  const dock = await page.getByRole("complementary", { name: "Design Brief utility panel" }).boundingBox();
  expect(canvas && dock).toBeTruthy();
  if (!canvas || !dock) return;
  expect(dock.y).toBeGreaterThan(canvas.y + canvas.height / 2);
  const downloadPromise = page.waitForEvent("download");
  await button.click();
  const download = await downloadPromise;
  const markdown = await readFile((await download.path())!, "utf8");
  expect(markdown).toContain("Keep orders durable");
  expect(markdown).toContain("## Components\n\nNone modeled.");
  expect(markdown).toContain("## Boundaries\n\nNone modeled.");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});
