import type { ComponentId } from "../domain/identifiers";

export type DiagramNodeSize = Readonly<{
  width: number;
  height: number;
}>;

export type DiagramNodeSizes = ReadonlyMap<ComponentId, DiagramNodeSize>;

const FALLBACK_NODE_SIZE: DiagramNodeSize = Object.freeze({
  width: 176,
  height: 72,
});

export function resolveDiagramNodeSize(
  knownNodeSize: DiagramNodeSize | undefined,
): DiagramNodeSize {
  if (
    knownNodeSize &&
    Number.isFinite(knownNodeSize.width) &&
    Number.isFinite(knownNodeSize.height) &&
    knownNodeSize.width > 0 &&
    knownNodeSize.height > 0
  ) {
    return {
      width: knownNodeSize.width,
      height: knownNodeSize.height,
    };
  }

  return FALLBACK_NODE_SIZE;
}
