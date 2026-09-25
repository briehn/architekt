import { describe, expect, it } from "vitest";

import { getReciprocalEdgePath } from "./reciprocal-edge-geometry";

describe("getReciprocalEdgePath", () => {
  it("mirrors horizontal connections when their direction reverses", () => {
    const forward = getReciprocalEdgePath({
      sourceX: 0,
      sourceY: 20,
      targetX: 200,
      targetY: 20,
      sourceSide: "right",
      targetSide: "left",
    });
    const reverse = getReciprocalEdgePath({
      sourceX: 200,
      sourceY: 20,
      targetX: 0,
      targetY: 20,
      sourceSide: "left",
      targetSide: "right",
    });

    expect(forward).toMatchObject({ labelX: 100, labelY: 38 });
    expect(reverse).toMatchObject({ labelX: 100, labelY: 2 });
    expect(forward.labelY - 20).toBeLessThan(24);
    expect(20 - reverse.labelY).toBeLessThan(24);
    expect(forward.path).toMatch(/^M 0,20 C /);
    expect(forward.path).toMatch(/ 200,20$/);
    expect(reverse.path).toMatch(/^M 200,20 C /);
    expect(reverse.path).toMatch(/ 0,20$/);
  });

  it("mirrors vertical and diagonal chords", () => {
    const vertical = getReciprocalEdgePath({
      sourceX: 10, sourceY: 0, targetX: 10, targetY: 100,
      sourceSide: "bottom", targetSide: "top",
    });
    const verticalReverse = getReciprocalEdgePath({
      sourceX: 10, sourceY: 100, targetX: 10, targetY: 0,
      sourceSide: "top", targetSide: "bottom",
    });
    const diagonal = getReciprocalEdgePath({
      sourceX: 0, sourceY: 0, targetX: 60, targetY: 80,
      sourceSide: "right", targetSide: "left",
    });
    const diagonalReverse = getReciprocalEdgePath({
      sourceX: 60, sourceY: 80, targetX: 0, targetY: 0,
      sourceSide: "left", targetSide: "right",
    });

    expect(vertical).toMatchObject({ labelX: -2, labelY: 50 });
    expect(verticalReverse).toMatchObject({ labelX: 22, labelY: 50 });
    expect(diagonal.labelX).toBeCloseTo(20.4);
    expect(diagonal.labelY).toBeCloseTo(47.2);
    expect(diagonalReverse.labelX).toBeCloseTo(39.6);
    expect(diagonalReverse.labelY).toBeCloseTo(32.8);
  });

  it.each([
    [20, 12],
    [80, 12],
    [200, 18],
    [1000, 21],
  ])("keeps distance %i on a nearby lane with midpoint offset %i", (distance, expectedOffset) => {
    const result = getReciprocalEdgePath({
      sourceX: 0, sourceY: 0, targetX: distance, targetY: 0,
      sourceSide: "right", targetSide: "left",
    });

    expect(result.labelX).toBe(distance / 2);
    expect(result.labelY).toBe(expectedOffset);
    expect(result.labelY).toBeLessThanOrEqual(21);
    expect(result.path.match(/ C /g)).toHaveLength(1);
  });

  it("produces finite, deterministic paths for coincident and near-zero endpoints", () => {
    const coincident = Object.freeze({
      sourceX: 4, sourceY: 6, targetX: 4, targetY: 6,
      sourceSide: "right" as const, targetSide: "left" as const,
    });
    const result = getReciprocalEdgePath(coincident);
    const reverse = getReciprocalEdgePath({
      ...coincident, sourceSide: "left", targetSide: "right",
    });
    const nearZero = getReciprocalEdgePath({
      ...coincident, targetX: 4 + 1e-10,
    });

    expect(result).toMatchObject({ labelX: 4, labelY: 18 });
    expect(reverse).toMatchObject({ labelX: 4, labelY: -6 });
    for (const path of [result.path, reverse.path, nearZero.path]) {
      expect(path).not.toMatch(/NaN|Infinity/);
      expect(
        path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
          ?.every((coordinate) => Number.isFinite(Number(coordinate))),
      ).toBe(true);
    }
    expect(getReciprocalEdgePath({ ...coincident })).toEqual(result);
    expect(coincident).toEqual({
      sourceX: 4, sourceY: 6, targetX: 4, targetY: 6,
      sourceSide: "right", targetSide: "left",
    });
  });
});
