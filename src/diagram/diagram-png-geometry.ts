export const PNG_OUTER_PADDING = 32;
export const PNG_EDGE_ALLOWANCE = 12;
export const PNG_PREFERRED_SCALE = 2;
export const PNG_MAX_DIMENSION = 8192;
export const PNG_MAX_PIXELS = 16_777_216;
// SVG foreignObject and browser layout cannot reliably render arbitrarily large source scenes.
export const PNG_MAX_SOURCE_DIMENSION = 32_768;

export type DiagramExportExtent = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  allowance?: number;
}>;

export type DiagramExportBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export function calculateDiagramExportBounds(
  extents: readonly DiagramExportExtent[],
): DiagramExportBounds | null {
  if (extents.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const extent of extents) {
    const { x, y, width, height, allowance = 0 } = extent;
    if (![x, y, width, height, allowance].every(Number.isFinite) ||
      width < 0 || height < 0 || allowance < 0 ||
      !Number.isFinite(x + width) || !Number.isFinite(y + height)) return null;
    left = Math.min(left, x - allowance);
    top = Math.min(top, y - allowance);
    right = Math.max(right, x + width + allowance);
    bottom = Math.max(bottom, y + height + allowance);
  }

  const x = Math.floor(left - PNG_OUTER_PADDING);
  const y = Math.floor(top - PNG_OUTER_PADDING);
  const width = Math.ceil(right + PNG_OUTER_PADDING) - x;
  const height = Math.ceil(bottom + PNG_OUTER_PADDING) - y;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
    width > PNG_MAX_SOURCE_DIMENSION || height > PNG_MAX_SOURCE_DIMENSION) return null;
  return { x, y, width, height };
}

export type PngOutputSize = Readonly<{
  width: number;
  height: number;
  reduced: boolean;
}>;

export function choosePngOutputSize(bounds: Pick<DiagramExportBounds, "width" | "height">): PngOutputSize | null {
  const { width, height } = bounds;
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
    width > PNG_MAX_SOURCE_DIMENSION || height > PNG_MAX_SOURCE_DIMENSION) return null;
  const scale = Math.min(
    PNG_PREFERRED_SCALE,
    PNG_MAX_DIMENSION / width,
    PNG_MAX_DIMENSION / height,
    Math.sqrt(PNG_MAX_PIXELS / (width * height)),
  );
  const outputWidth = Math.floor(width * scale);
  const outputHeight = Math.floor(height * scale);
  if (!Number.isFinite(scale) || outputWidth < 1 || outputHeight < 1) return null;
  return {
    width: outputWidth,
    height: outputHeight,
    reduced: scale < PNG_PREFERRED_SCALE,
  };
}
