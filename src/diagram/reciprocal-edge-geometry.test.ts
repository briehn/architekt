import { getBezierPath, Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { getReciprocalEdgePath } from "./reciprocal-edge-geometry";

type Point = readonly [number, number];

function cubicPoints(path: string): readonly Point[] {
  const numbers = path.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
  if (!numbers || numbers.length !== 8) {
    throw new Error(`Expected one cubic path: ${path}`);
  }
  return [
    [numbers[0]!, numbers[1]!],
    [numbers[2]!, numbers[3]!],
    [numbers[4]!, numbers[5]!],
    [numbers[6]!, numbers[7]!],
  ];
}

describe("getReciprocalEdgePath", () => {
  it.each([
    ["horizontal", 0, 20, 200, 20, Position.Right, Position.Left],
    ["vertical", 10, 0, 10, 100, Position.Bottom, Position.Top],
    ["diagonal", 0, 0, 60, 80, Position.Right, Position.Left],
    ["mixed right/top", 176, 36, 338, 150, Position.Right, Position.Top],
    ["moved diagonal", 310, 170, 40, 25, Position.Left, Position.Right],
  ] as const)("overlaps reversed %s paths using the built-in Bézier geometry", (
    _name, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  ) => {
    const forward = getReciprocalEdgePath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    });
    const reverse = getReciprocalEdgePath({
      sourceX: targetX, sourceY: targetY, targetX: sourceX, targetY: sourceY,
      sourcePosition: targetPosition, targetPosition: sourcePosition,
    });

    expect(forward.path).toBe(getBezierPath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    })[0]);
    expect(cubicPoints(reverse.path)).toEqual([...cubicPoints(forward.path)].reverse());
    expect([forward.labelX - reverse.labelX, forward.labelY - reverse.labelY])
      .not.toEqual([0, 0]);
    const [, centerX, centerY] = getBezierPath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    });
    expect((forward.labelX + reverse.labelX) / 2).toBeCloseTo(centerX);
    expect((forward.labelY + reverse.labelY) / 2).toBeCloseTo(centerY);
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    expect((forward.labelX - centerX) * dx + (forward.labelY - centerY) * dy)
      .toBeCloseTo(0);
    expect((forward.labelX - centerX) * -dy + (forward.labelY - centerY) * dx)
      .toBeGreaterThan(0);
  });

  it("places horizontal labels above and below the shared path", () => {
    const forward = getReciprocalEdgePath({
      sourceX: 0, sourceY: 20, targetX: 200, targetY: 20,
      sourcePosition: Position.Right, targetPosition: Position.Left,
    });
    const reverse = getReciprocalEdgePath({
      sourceX: 200, sourceY: 20, targetX: 0, targetY: 20,
      sourcePosition: Position.Left, targetPosition: Position.Right,
    });

    expect(forward.labelX).toBe(100);
    expect(reverse.labelX).toBe(100);
    expect(forward.labelY).toBeGreaterThan(20);
    expect(reverse.labelY).toBeLessThan(20);
  });

  it("keeps coincident endpoints finite and labels separated", () => {
    const forward = getReciprocalEdgePath({
      sourceX: 4, sourceY: 6, targetX: 4, targetY: 6,
      sourcePosition: Position.Right, targetPosition: Position.Left,
    });
    const reverse = getReciprocalEdgePath({
      sourceX: 4, sourceY: 6, targetX: 4, targetY: 6,
      sourcePosition: Position.Left, targetPosition: Position.Right,
    });

    expect(cubicPoints(reverse.path)).toEqual([...cubicPoints(forward.path)].reverse());
    expect(forward.path).not.toMatch(/NaN|Infinity/);
    expect(reverse.path).not.toMatch(/NaN|Infinity/);
    expect(forward.labelY).toBeGreaterThan(6);
    expect(reverse.labelY).toBeLessThan(6);
  });

  it("separates labels on opposite sides for nearly coincident mixed handles", () => {
    const forward = getReciprocalEdgePath({
      sourceX: 4, sourceY: 6, targetX: 4 + 1e-8, targetY: 6 + 1e-8,
      sourcePosition: Position.Right, targetPosition: Position.Top,
    });
    const reverse = getReciprocalEdgePath({
      sourceX: 4 + 1e-8, sourceY: 6 + 1e-8, targetX: 4, targetY: 6,
      sourcePosition: Position.Top, targetPosition: Position.Right,
    });

    expect(cubicPoints(reverse.path)).toEqual([...cubicPoints(forward.path)].reverse());
    expect((forward.labelX + reverse.labelX) / 2).toBeCloseTo(4);
    expect((forward.labelY + reverse.labelY) / 2).toBeCloseTo(6);
  });
});
