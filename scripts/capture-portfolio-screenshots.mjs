import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const outputDirectory = "docs/screenshots";
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
});

try {
  await mkdir(outputDirectory, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(process.env.ARCHITEKT_SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3100/");
  await expect(page.getByRole("button", { name: "Generate architecture" })).toBeVisible();

  await page.getByRole("button", { name: "Generate architecture" }).click();
  await page.getByRole("textbox", { name: "Describe your system" }).fill(
    "Design a URL shortener for about 10 million daily active users. Include the redirect path, durable URL storage, a cache, and asynchronous click analytics. State workload assumptions. Keep the diagram concise.",
  );
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI-generated draft" })).toBeVisible({ timeout: 55_000 });
  await page.screenshot({ path: join(outputDirectory, "ai-review.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Apply to diagram" }).click();
  await expect(page.locator(".react-flow__node-architekt").first()).toBeVisible();
  await page.getByRole("button", { name: "Fit view" }).click();
  await page.screenshot({ path: join(outputDirectory, "workbench.png"), animations: "disabled" });

  await page.getByRole("button", { name: "Create boundary" }).click();
  const form = page.locator("form").filter({ has: page.locator("#boundary-create-name") });
  await form.getByRole("textbox", { name: "Name" }).fill("Request path");
  await form.getByRole("checkbox").nth(1).check();
  await form.getByRole("checkbox").nth(2).check();
  await form.getByRole("button", { name: "Create boundary" }).click();
  await expect(page.locator(".react-flow__node-boundary")).toHaveCount(1);
  await page.getByRole("button", { name: "Close utility panel" }).click();
  await page.getByRole("button", { name: "Fit view" }).click();
  await page.screenshot({ path: join(outputDirectory, "boundaries.png"), animations: "disabled" });
} finally {
  await browser.close();
}
