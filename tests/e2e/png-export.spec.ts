import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const documentWithDiagram = {
  schemaVersion: 5,
  designContext: { title: "PNG Sample", requirementsAndConstraints: "", assumptionsAndOpenQuestions: "", decisionsAndTradeoffs: "" },
  graph: {
    components: [
      { id: "client", name: "Browser", kind: "client" },
      { id: "api", name: "API", kind: "service" },
      { id: "db", name: "Database", kind: "database" },
    ],
    connections: [
      { id: "request", sourceComponentId: "client", targetComponentId: "api", kind: "request-response" },
      { id: "reply", sourceComponentId: "api", targetComponentId: "client", kind: "streaming" },
      { id: "data", sourceComponentId: "api", targetComponentId: "db", kind: "data-access" },
    ],
    boundaries: [{ id: "core", name: "Core", memberComponentIds: ["api", "db"] }, { id: "empty", name: "Future", memberComponentIds: [] }],
  },
  nodePositions: [
    { componentId: "client", x: -320, y: -100 },
    { componentId: "api", x: 300, y: 40 },
    { componentId: "db", x: 1800, y: 500 },
  ],
};

async function openDocument(page: Page, document: unknown = documentWithDiagram) {
  await page.addInitScript((value) => {
    localStorage.setItem("architekt:architecture-editor", JSON.stringify(value));
  }, document);
  await page.goto("/");
  await page.getByRole("button", { name: /^Open Design Brief:/ }).click();
}

async function downloadPng(page: Page, viaKeyboard = false) {
  const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
  const button = page.getByRole("button", { name: "Export PNG" });
  if (viaKeyboard) {
    await button.focus();
    await button.press("Enter");
  } else {
    await button.click();
  }
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { download, bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("captures the complete rendered scene without viewport or canonical changes", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await openDocument(page);
  await expect(page.locator(".react-flow__node-architekt")).toHaveCount(3);
  const stored = await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"));
  const viewportBefore = await page.locator(".react-flow__viewport").getAttribute("style");
  await page.locator('.react-flow__node-architekt[data-id="api"]').click();
  await page.locator('.react-flow__node-architekt[data-id="api"] .architekt-anchor').nth(1).click();
  const selectedBefore = await page.locator('.react-flow__node-architekt[data-id="api"]').getAttribute("class");
  await expect(page.locator(".architekt-node--connection-source")).toHaveCount(1);
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob instanceof Blob && blob.type === "image/png") {
        (window as Window & { exportedPng?: Blob }).exportedPng = blob;
        document.documentElement.dataset.pngMime = blob.type;
      }
      return original(blob);
    };
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.matches('body > [aria-hidden="true"]')) continue;
        const scene = node.querySelector(".architekt-diagram");
        if (!scene) continue;
        document.documentElement.dataset.pngStage = JSON.stringify({
          inert: node.inert,
          nodes: scene.querySelectorAll(".react-flow__node-architekt").length,
          boundaries: scene.querySelectorAll(".react-flow__node-boundary").length,
          boundaryVisibility: getComputedStyle(scene.querySelector(".react-flow__node-boundary")!).visibility,
          edges: scene.querySelectorAll(".react-flow__edge-path").length,
          labels: [...scene.querySelectorAll(".react-flow__edge-text")].map((label) => label.textContent),
          handles: scene.querySelectorAll(".react-flow__handle").length,
          selected: scene.querySelectorAll(".architekt-node--selected, .architekt-boundary--selected").length,
          pendingSource: scene.querySelectorAll(".architekt-node--connection-source").length,
          markers: [...scene.querySelectorAll("marker[id]")].map((marker) => marker.id),
          markerReferences: [...scene.querySelectorAll(".react-flow__edge-path[marker-end]")].map((path) => path.getAttribute("marker-end")),
          nodeColor: getComputedStyle(scene.querySelector(".react-flow__node-default")!).backgroundColor,
        });
      }
    }).observe(document.body, { childList: true });
  });
  const result = await downloadPng(page, true);
  expect(result.download.suggestedFilename()).toBe("png-sample.png");
  expect(result.width).toBeGreaterThan(900);
  expect(result.height).toBeGreaterThan(650);
  expect(result.bytes.length).toBeGreaterThan(10_000);
  expect(await page.locator("html").getAttribute("data-png-mime")).toBe("image/png");
  const stage = JSON.parse((await page.locator("html").getAttribute("data-png-stage")) ?? "{}");
  expect(stage).toMatchObject({ inert: true, nodes: 3, boundaries: 1, boundaryVisibility: "visible", edges: 3, handles: 0, selected: 0, pendingSource: 0, nodeColor: "rgb(255, 255, 255)" });
  expect(stage.labels).toEqual(expect.arrayContaining(["Request/response", "Streaming", "Data access"]));
  expect(stage.markers).toHaveLength(1);
  expect(stage.markerReferences).toHaveLength(3);
  expect(stage.markerReferences.every((reference: string) => reference.includes(stage.markers[0]))).toBe(true);
  await expect(page.locator('body > [aria-hidden="true"] .architekt-diagram')).toHaveCount(0);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(viewportBefore);
  expect(await page.locator('.react-flow__node-architekt[data-id="api"]').getAttribute("class")).toBe(selectedBefore);
  await expect(page.locator(".architekt-node--connection-source")).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"))).toBe(stored);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "PNG download started" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeFocused();
  const pixels = await page.evaluate(async () => {
    const blob = (window as Window & { exportedPng?: Blob }).exportedPng!;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const corner = [...context.getImageData(0, 0, 1, 1).data];
    const sampled = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonwhite = 0;
    for (let i = 0; i < sampled.length; i += 128) if (sampled[i] < 245 || sampled[i + 1] < 245 || sampled[i + 2] < 245) nonwhite++;
    bitmap.close();
    return { corner, nonwhite };
  });
  expect(pixels.corner).toEqual([255, 255, 255, 255]);
  expect(pixels.nonwhite).toBeGreaterThan(100);

  await page.locator(".react-flow__viewport").evaluate((viewport) => {
    (viewport as HTMLElement).style.transform = "translate(-200px, 50px) scale(0.8)";
  });
  await expect.poll(async () => page.locator(".react-flow__viewport").getAttribute("style"))
    .not.toBe(viewportBefore);
  const zoomedViewport = await page.locator(".react-flow__viewport").getAttribute("style");
  const zoomedResult = await downloadPng(page);
  expect([zoomedResult.width, zoomedResult.height]).toEqual([result.width, result.height]);
  expect(zoomedResult.bytes.equals(result.bytes)).toBe(true);
  expect(await page.locator(".react-flow__viewport").getAttribute("style")).toBe(zoomedViewport);
});

test("dark narrow editor still exports stable-light complete PNG", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await openDocument(page);
  const button = page.getByRole("button", { name: "Export PNG" });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.evaluate(() => {
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.matches('body > [aria-hidden="true"]')) continue;
        const exported = node.querySelector(".architekt-node__name");
        if (exported) document.documentElement.dataset.exportNameColor = getComputedStyle(exported).color;
      }
    }).observe(document.body, { childList: true });
  });
  const result = await downloadPng(page);
  expect(result.width).toBeGreaterThan(390);
  expect(result.bytes.length).toBeGreaterThan(10_000);
  expect(await page.locator("html").getAttribute("data-export-name-color")).toBe("rgb(11, 18, 32)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("empty and context-only documents explain why PNG is unavailable", async ({ page }) => {
  for (const graph of [
    { components: [], connections: [], boundaries: [] },
    { components: [], connections: [], boundaries: [{ id: "empty", name: "Future", memberComponentIds: [] }] },
  ]) {
    await openDocument(page, { ...documentWithDiagram, graph, nodePositions: [] });
    await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
    await expect(page.getByText("Add a component to export a diagram.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Export Markdown" })).toBeEnabled();
  }
});

test("capture failure cleans staging and allows retry without changing JSON export", async ({ page }) => {
  await openDocument(page);
  const stored = await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"));
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    (window as Window & { originalCreateObjectURL?: typeof URL.createObjectURL }).originalCreateObjectURL = original;
    URL.createObjectURL = () => { throw new Error("blocked"); };
  });
  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(page.getByRole("complementary", { name: "Design Brief utility panel" }).getByRole("alert")).toContainText("Could not export PNG. Try again.");
  await expect(page.locator('body > [aria-hidden="true"] .architekt-diagram')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeFocused();
  await page.evaluate(() => { URL.createObjectURL = (window as Window & { originalCreateObjectURL?: typeof URL.createObjectURL }).originalCreateObjectURL!; });
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await jsonDownload).suggestedFilename()).toBe("png-sample.architekt.json");
  expect(await page.evaluate(() => localStorage.getItem("architekt:architecture-editor"))).toBe(stored);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("wide diagram is downsampled within output limits without cropping", async ({ page }) => {
  const wide = {
    ...documentWithDiagram,
    graph: {
      components: [{ id: "left", name: "Left", kind: "client" }, { id: "right", name: "Right", kind: "service" }],
      connections: [{ id: "link", sourceComponentId: "left", targetComponentId: "right", kind: "generic" }],
      boundaries: [],
    },
    nodePositions: [{ componentId: "left", x: -300, y: 0 }, { componentId: "right", x: 5900, y: 0 }],
  };
  await openDocument(page, wide);
  const result = await downloadPng(page);
  expect(result.width).toBe(8192);
  expect(result.height).toBeLessThanOrEqual(8192);
  expect(result.width * result.height).toBeLessThanOrEqual(16_777_216);
  await expect(page.getByRole("status").filter({ hasText: "Resolution was reduced" })).toBeVisible();
});

test("PNG respects dirty draft, boundary drag, and inline rename guards", async ({ page }) => {
  await openDocument(page);
  const exportButton = page.getByRole("button", { name: "Export PNG" });
  await page.getByRole("textbox", { name: "Title" }).fill("Unsaved title");
  await expect(exportButton).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(exportButton).toBeEnabled();

  const header = await page.locator(".architekt-boundary__header").boundingBox();
  expect(header).toBeTruthy();
  await page.mouse.move(header!.x + 20, header!.y + 12);
  await page.mouse.down();
  await page.mouse.move(header!.x + 45, header!.y + 20, { steps: 5 });
  await expect(exportButton).toBeDisabled();
  await page.mouse.up();
  await expect(exportButton).toBeEnabled();

  await page.locator('.react-flow__node-architekt[data-id="api"]').dblclick();
  await expect(page.getByRole("textbox", { name: "Rename component" })).toBeVisible();
  await expect(exportButton).toBeDisabled();
  await page.getByRole("textbox", { name: "Rename component" }).press("Escape");
  await expect(exportButton).toBeEnabled();
});

test("preparation announces, blocks duplicate export, and rejects a changed diagram", async ({ page }) => {
  await openDocument(page);
  await page.evaluate(() => Object.defineProperty(document.fonts, "status", { configurable: true, get: () => "loading" }));
  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect(page.getByRole("button", { name: "Preparing PNG…" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Preparing PNG" })).toBeVisible();
  const node = await page.locator('.react-flow__node-architekt[data-id="api"] .react-flow__node-default').boundingBox();
  expect(node).toBeTruthy();
  await page.mouse.move(node!.x + node!.width / 2, node!.y + node!.height / 2);
  await page.mouse.down();
  await page.mouse.move(node!.x + node!.width / 2 + 80, node!.y + node!.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("complementary", { name: "Design Brief utility panel" }).getByRole("alert"))
    .toContainText("The diagram changed while preparing the PNG. Export again.");
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeEnabled();
  await expect(page.locator('body > [aria-hidden="true"] .architekt-diagram')).toHaveCount(0);
});

test("a representative larger diagram exports within the raster budget", async ({ page }) => {
  test.slow();
  const components = Array.from({ length: 50 }, (_, index) => ({ id: `service-${index}`, name: `Service ${index + 1}`, kind: "service" }));
  const connections = Array.from({ length: 50 }, (_, index) => [
    { id: `next-${index}`, sourceComponentId: `service-${index}`, targetComponentId: `service-${(index + 1) % 50}`, kind: "request-response" },
    { id: `event-${index}`, sourceComponentId: `service-${index}`, targetComponentId: `service-${(index + 5) % 50}`, kind: "async-messaging" },
  ]).flat();
  const nodePositions = components.map((component, index) => ({ componentId: component.id, x: (index % 10) * 240, y: Math.floor(index / 10) * 150 }));
  const large = { ...documentWithDiagram, graph: { components, connections, boundaries: [{ id: "first-row", name: "First row", memberComponentIds: components.slice(0, 10).map((component) => component.id) }] }, nodePositions };
  await openDocument(page, large);
  const result = await downloadPng(page);
  expect(result.width).toBeGreaterThan(2000);
  expect(result.width).toBeLessThanOrEqual(8192);
  expect(result.height).toBeLessThanOrEqual(8192);
  expect(result.width * result.height).toBeLessThanOrEqual(16_777_216);
  await expect(page.locator('body > [aria-hidden="true"] .architekt-diagram')).toHaveCount(0);
});
