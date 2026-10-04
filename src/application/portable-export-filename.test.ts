import { describe, expect, it } from "vitest";

import { portableExportFilename } from "./portable-export-filename";
import { portableArchitectureFilename } from "../persistence/portable-architecture-document";

describe("portable export filenames", () => {
  it("preserves every existing JSON filename rule while sharing the title stem", () => {
    const cases = [
      ["", "architecture"],
      ["My Checkout Architecture", "my-checkout-architecture"],
      ["../CON\\payments: * A?", "con-payments-a"],
      ["CON", "architecture-con"],
      ["Crème brûlée", "creme-brulee"],
      ["設計 図", "設計-図"],
      ["x".repeat(60), "x".repeat(60)],
      ["x".repeat(150), "x".repeat(60)],
      ["😀".repeat(80), "architecture"],
    ] as const;
    for (const [title, stem] of cases) {
      expect(portableArchitectureFilename(title)).toBe(`${stem}.architekt.json`);
      expect(portableExportFilename(title, "json")).toBe(`${stem}.architekt.json`);
      expect(portableExportFilename(title, "markdown")).toBe(`${stem}.md`);
      expect(portableExportFilename(title, "png")).toBe(`${stem}.png`);
    }
  });

  it("limits the stem to 60 Unicode code points after normalization", () => {
    const title = "界".repeat(60) + "extra";
    expect(portableExportFilename(title, "markdown")).toBe(`${"界".repeat(60)}.md`);
  });
});
