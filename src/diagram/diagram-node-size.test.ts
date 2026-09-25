import { describe, expect, it } from "vitest";

import { resolveDiagramNodeSize } from "./diagram-node-size";

const FALLBACK_SIZE = { width: 176, height: 72 };

describe("resolveDiagramNodeSize", () => {
  it("uses finite positive dimensions without changing the supplied object", () => {
    const measurement = Object.freeze({ width: 240.5, height: 96.25 });

    expect(resolveDiagramNodeSize(measurement)).toEqual(measurement);
    expect(resolveDiagramNodeSize(measurement)).not.toBe(measurement);
    expect(measurement).toEqual({ width: 240.5, height: 96.25 });
  });

  it("uses the existing 176 by 72 fallback when measurement is missing", () => {
    expect(resolveDiagramNodeSize(undefined)).toEqual(FALLBACK_SIZE);
  });

  it.each([
    { width: 0, height: 72 },
    { width: 176, height: 0 },
    { width: -1, height: 72 },
    { width: 176, height: -1 },
    { width: Number.NaN, height: 72 },
    { width: 176, height: Number.NaN },
    { width: Number.POSITIVE_INFINITY, height: 72 },
    { width: 176, height: Number.NEGATIVE_INFINITY },
  ])("uses the same fallback for invalid dimensions %#", (measurement) => {
    expect(resolveDiagramNodeSize(measurement)).toEqual(FALLBACK_SIZE);
  });
});
