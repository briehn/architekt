import { describe, expect, it } from "vitest";

import type { ComponentId } from "../domain/identifiers";
import {
  selectAdaptiveAnchorPair,
  type DiagramAnchorPair,
  type DiagramNodeRectangle,
} from "./adaptive-anchor-geometry";

function rectangle(
  componentId: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): DiagramNodeRectangle {
  return { componentId: componentId as ComponentId, x, y, width, height };
}

describe("selectAdaptiveAnchorPair", () => {
  it.each([
    {
      name: "rightward",
      target: rectangle("b", 300, 0),
      expected: { sourceSide: "right", targetSide: "left" },
    },
    {
      name: "leftward",
      target: rectangle("b", -300, 0),
      expected: { sourceSide: "left", targetSide: "right" },
    },
    {
      name: "downward",
      target: rectangle("b", 0, 300),
      expected: { sourceSide: "bottom", targetSide: "top" },
    },
    {
      name: "upward",
      target: rectangle("b", 0, -300),
      expected: { sourceSide: "top", targetSide: "bottom" },
    },
  ] satisfies ReadonlyArray<{
    name: string;
    target: DiagramNodeRectangle;
    expected: DiagramAnchorPair;
  }>)("selects cardinal sides for $name", ({ target, expected }) => {
    expect(selectAdaptiveAnchorPair(rectangle("a", 0, 0), target)).toEqual(
      expected,
    );
  });

  it.each([
    ["lower-right", 200, 200, "right", "top"],
    ["upper-right", 200, -200, "right", "bottom"],
    ["lower-left", -200, 200, "bottom", "right"],
    ["upper-left", -200, -200, "top", "right"],
  ] as const)("permits a mixed pair toward the %s", (_name, x, y, sourceSide, targetSide) => {
    expect(selectAdaptiveAnchorPair(
      rectangle("a", 0, 0), rectangle("b", x, y),
    )).toEqual({ sourceSide, targetSide });
  });

  it("chooses right/top for a moderately offset Client and Cache", () => {
    expect(selectAdaptiveAnchorPair(
      rectangle("client", 0, 0, 176, 72),
      rectangle("cache", 250, 150, 176, 72),
    )).toEqual({ sourceSide: "right", targetSide: "top" });
  });

  it("keeps a shallow diagonal on an opposing pair", () => {
    expect(selectAdaptiveAnchorPair(
      rectangle("a", 0, 0, 176, 72),
      rectangle("b", 800, 200, 176, 72),
    )).toEqual({ sourceSide: "right", targetSide: "left" });
  });

  it.each([
    ["wide source", rectangle("a", 0, 0, 400, 80), rectangle("b", 425, 100, 100, 80), "right", "top"],
    ["wide target", rectangle("a", 0, 0, 100, 80), rectangle("b", 150, 100, 400, 80), "bottom", "left"],
    ["tall source", rectangle("a", 0, 0, 100, 400), rectangle("b", 150, 200, 100, 80), "right", "left"],
    ["tall target", rectangle("a", 0, 0, 100, 80), rectangle("b", 150, 200, 100, 400), "right", "top"],
  ] as const)("uses each side midpoint for a %s", (_name, source, target, sourceSide, targetSide) => {
    expect(selectAdaptiveAnchorPair(source, target)).toEqual({ sourceSide, targetSide });
  });

  it("selects the same pair after translating both rectangles", () => {
    const source = rectangle("a", -80, 35, 220, 90);
    const target = rectangle("b", 100, 180, 120, 170);
    const translated = (rect: DiagramNodeRectangle): DiagramNodeRectangle => ({
      ...rect,
      x: rect.x + 1000,
      y: rect.y - 700,
    });

    expect(
      selectAdaptiveAnchorPair(translated(source), translated(target)),
    ).toEqual(selectAdaptiveAnchorPair(source, target));
  });

  it.each([
    ["horizontal", rectangle("a", 0, 0), rectangle("b", 300, 0)],
    ["vertical", rectangle("a", 0, 0), rectangle("b", 0, 300)],
    ["lower-right", rectangle("a", 0, 0), rectangle("b", 200, 200)],
    ["upper-right", rectangle("a", 0, 0), rectangle("b", 200, -200)],
    ["lower-left", rectangle("a", 0, 0), rectangle("b", -200, 200)],
    ["upper-left", rectangle("a", 0, 0), rectangle("b", -200, -200)],
    ["close diagonal", rectangle("a", 0, 0, 176, 72), rectangle("b", 180, 90, 176, 72)],
    ["far shallow diagonal", rectangle("a", 0, 0, 176, 72), rectangle("b", 800, 200, 176, 72)],
    ["unequal", rectangle("a", 0, 0, 400, 80), rectangle("b", 425, 100, 100, 80)],
    ["touching", rectangle("a", 0, 0), rectangle("b", 100, 0)],
    ["overlapping", rectangle("a", 0, 0), rectangle("b", 50, 0)],
    ["contained", rectangle("a", 0, 0, 400, 400), rectangle("b", 100, 100)],
    ["coincident centers", rectangle("a", 0, 0), rectangle("b", -50, -50, 200, 200)],
  ] as const)("reverses the same physical pair for %s", (_name, a, b) => {
    const forward = selectAdaptiveAnchorPair(a, b);
    const reverse = selectAdaptiveAnchorPair(b, a);
    expect(forward.sourceSide).toBe(reverse.targetSide);
    expect(forward.targetSide).toBe(reverse.sourceSide);
    const translate = (rect: DiagramNodeRectangle): DiagramNodeRectangle => ({
      ...rect, x: rect.x + 1000, y: rect.y - 700,
    });
    expect(selectAdaptiveAnchorPair(translate(a), translate(b))).toEqual(forward);
  });

  it("breaks an equal-cost mixed-path tie by the spatially left rectangle", () => {
    const left = rectangle("z", 0, 0, 176, 72);
    const right = rectangle("a", 250, 150, 176, 72);

    expect(selectAdaptiveAnchorPair(left, right)).toEqual({
      sourceSide: "right", targetSide: "top",
    });
    expect(selectAdaptiveAnchorPair(right, left)).toEqual({
      sourceSide: "top", targetSide: "right",
    });
  });

  it("uses the previous normalized-axis policy only when no pair mutually faces", () => {
    expect(selectAdaptiveAnchorPair(
      rectangle("a", 0, 0), rectangle("b", 50, 0),
    )).toEqual({ sourceSide: "right", targetSide: "left" });
    expect(selectAdaptiveAnchorPair(
      rectangle("a", 0, 0), rectangle("b", 100, 0),
    )).toEqual({ sourceSide: "right", targetSide: "left" });
  });

  it("uses ID order for coincident centers and reverses the pair with direction", () => {
    const a = rectangle("a", 0, 0, 100, 100);
    const b = rectangle("b", -50, -50, 200, 200);

    expect(selectAdaptiveAnchorPair(a, b)).toEqual({
      sourceSide: "right",
      targetSide: "left",
    });
    expect(selectAdaptiveAnchorPair(b, a)).toEqual({
      sourceSide: "left",
      targetSide: "right",
    });
  });

  it("is deterministic for repeated and fresh equivalent inputs without mutation", () => {
    const source = Object.freeze(rectangle("a", 10, -30, 220, 80));
    const target = Object.freeze(rectangle("b", 320, 90, 120, 140));
    const expected = selectAdaptiveAnchorPair(source, target);

    for (let index = 0; index < 10; index += 1) {
      expect(selectAdaptiveAnchorPair(source, target)).toEqual(expected);
      expect(
        selectAdaptiveAnchorPair({ ...source }, { ...target }),
      ).toEqual(expected);
    }

    expect(source).toEqual(rectangle("a", 10, -30, 220, 80));
    expect(target).toEqual(rectangle("b", 320, 90, 120, 140));
  });

  it("resolves invalid rectangle sizes through the shared fallback policy", () => {
    expect(
      selectAdaptiveAnchorPair(
        rectangle("a", 0, 0, Number.NaN, 100),
        rectangle("b", 300, 0, 100, 100),
      ),
    ).toEqual({ sourceSide: "right", targetSide: "left" });
  });
});
