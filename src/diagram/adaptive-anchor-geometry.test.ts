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
    {
      name: "diagonal toward the lower right",
      target: rectangle("b", 300, 100),
      expected: { sourceSide: "right", targetSide: "left" },
    },
    {
      name: "diagonal toward the upper left",
      target: rectangle("b", -100, -300),
      expected: { sourceSide: "top", targetSide: "bottom" },
    },
  ] satisfies ReadonlyArray<{
    name: string;
    target: DiagramNodeRectangle;
    expected: DiagramAnchorPair;
  }>)("selects opposing sides for $name", ({ target, expected }) => {
    expect(selectAdaptiveAnchorPair(rectangle("a", 0, 0), target)).toEqual(
      expected,
    );
  });

  it("chooses horizontal on an exact normalized-score tie", () => {
    expect(
      selectAdaptiveAnchorPair(
        rectangle("a", 0, 0),
        rectangle("b", 200, 200),
      ),
    ).toEqual({ sourceSide: "right", targetSide: "left" });
  });

  it("changes axis for the same center displacement when proportions change", () => {
    const squarePair = selectAdaptiveAnchorPair(
      rectangle("a", -50, -50, 100, 100),
      rectangle("b", 70, 30, 100, 100),
    );
    const widePair = selectAdaptiveAnchorPair(
      rectangle("a", -150, -25, 300, 50),
      rectangle("b", -30, 55, 300, 50),
    );

    expect(squarePair).toEqual({ sourceSide: "right", targetSide: "left" });
    expect(widePair).toEqual({ sourceSide: "bottom", targetSide: "top" });
  });

  it("accounts for wide-source and wide-target asymmetry", () => {
    expect(
      selectAdaptiveAnchorPair(
        rectangle("a", 0, 0, 400, 80),
        rectangle("b", 425, 100, 100, 80),
      ),
    ).toEqual({ sourceSide: "bottom", targetSide: "top" });
    expect(
      selectAdaptiveAnchorPair(
        rectangle("a", 0, 0, 100, 80),
        rectangle("b", 150, 100, 400, 80),
      ),
    ).toEqual({ sourceSide: "bottom", targetSide: "top" });
  });

  it("can choose horizontal for tall unequal nodes despite a larger vertical gap", () => {
    expect(
      selectAdaptiveAnchorPair(
        rectangle("a", 0, 0, 100, 300),
        rectangle("b", 150, 200, 100, 400),
      ),
    ).toEqual({ sourceSide: "right", targetSide: "left" });
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
