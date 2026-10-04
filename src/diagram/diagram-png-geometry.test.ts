import { describe, expect, it } from "vitest";
import {
  calculateDiagramExportBounds,
  choosePngOutputSize,
  PNG_MAX_DIMENSION,
  PNG_MAX_PIXELS,
} from "./diagram-png-geometry";

describe("PNG diagram bounds", () => {
  it("adds 32 diagram pixels around one component", () => {
    expect(calculateDiagramExportBounds([{ x: 10, y: 20, width: 176, height: 72 }]))
      .toEqual({ x: -22, y: -12, width: 240, height: 136 });
  });

  it("unions negative, offscreen, and widely spaced component and boundary extents deterministically", () => {
    const extents = [
      { x: 4000, y: 200, width: 176, height: 72 },
      { x: -300, y: -180, width: 200, height: 160 },
      { x: -325, y: -240, width: 270, height: 240 },
    ];
    const result = { x: -357, y: -272, width: 4565, height: 576 };
    expect(calculateDiagramExportBounds(extents)).toEqual(result);
    expect(calculateDiagramExportBounds([...extents].reverse())).toEqual(result);
  });

  it("includes edge/label allowance, including horizontal paths", () => {
    expect(calculateDiagramExportBounds([
      { x: 0, y: 0, width: 176, height: 72 },
      { x: 200, y: -50, width: 80, height: 0, allowance: 12 },
    ])).toEqual({ x: -32, y: -94, width: 356, height: 198 });
  });

  it("rejects empty, non-finite, and unrenderable extents", () => {
    expect(calculateDiagramExportBounds([])).toBeNull();
    expect(calculateDiagramExportBounds([{ x: Infinity, y: 0, width: 1, height: 1 }])).toBeNull();
    expect(calculateDiagramExportBounds([{ x: 0, y: 0, width: -1, height: 1 }])).toBeNull();
    expect(calculateDiagramExportBounds([{ x: 0, y: 0, width: 40_000, height: 1 }])).toBeNull();
  });
});

describe("PNG output size", () => {
  it("prefers 2x output independent of device pixel ratio", () => {
    expect(choosePngOutputSize({ width: 400, height: 200 }))
      .toEqual({ width: 800, height: 400, reduced: false });
  });

  it("reduces proportionally for width and height limits without cropping", () => {
    expect(choosePngOutputSize({ width: 5000, height: 1000 }))
      .toEqual({ width: 8192, height: 1638, reduced: true });
    expect(choosePngOutputSize({ width: 1000, height: 5000 }))
      .toEqual({ width: 1638, height: 8192, reduced: true });
  });

  it("obeys the total pixel budget", () => {
    const output = choosePngOutputSize({ width: 3000, height: 3000 });
    expect(output).not.toBeNull();
    expect(output!.reduced).toBe(true);
    expect(output!.width).toBe(output!.height);
    expect(output!.width * output!.height).toBeLessThanOrEqual(PNG_MAX_PIXELS);
    expect(output!.width).toBeLessThanOrEqual(PNG_MAX_DIMENSION);
  });

  it("rejects invalid dimensions and returns finite bounded output", () => {
    expect(choosePngOutputSize({ width: 0, height: 100 })).toBeNull();
    expect(choosePngOutputSize({ width: NaN, height: 100 })).toBeNull();
    expect(choosePngOutputSize({ width: 40_000, height: 100 })).toBeNull();
    const output = choosePngOutputSize({ width: 10_000, height: 100 });
    expect(output).not.toBeNull();
    expect(Number.isFinite(output!.width)).toBe(true);
    expect(Number.isFinite(output!.height)).toBe(true);
    expect(output!.width).toBeLessThanOrEqual(PNG_MAX_DIMENSION);
  });
});
