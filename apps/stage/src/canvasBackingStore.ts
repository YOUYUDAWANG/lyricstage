export interface CanvasBackingStoreV1 {
  pixelWidth: number;
  pixelHeight: number;
  scaleX: number;
  scaleY: number;
}

const DEFAULT_MAX_PIXELS = 3840 * 2160;
const DEFAULT_MAX_DIMENSION = 4096;

export const canvasBackingStoreForV1 = (
  cssWidth: number,
  cssHeight: number,
  requestedScale: number,
  maxPixels = DEFAULT_MAX_PIXELS,
  maxDimension = DEFAULT_MAX_DIMENSION,
): CanvasBackingStoreV1 => {
  const width = Math.max(1, Number.isFinite(cssWidth) ? cssWidth : 1);
  const height = Math.max(1, Number.isFinite(cssHeight) ? cssHeight : 1);
  const requested = Math.max(1, Number.isFinite(requestedScale) ? requestedScale : 1);
  const boundedPixels = Math.max(1, Number.isFinite(maxPixels) ? maxPixels : DEFAULT_MAX_PIXELS);
  const boundedDimension = Math.max(1, Number.isFinite(maxDimension) ? maxDimension : DEFAULT_MAX_DIMENSION);
  const scale = Math.min(
    requested,
    boundedDimension / width,
    boundedDimension / height,
    Math.sqrt(boundedPixels / (width * height)),
  );
  const round = scale < requested ? Math.floor : Math.ceil;
  const pixelWidth = Math.max(1, round(width * scale));
  const pixelHeight = Math.max(1, round(height * scale));
  return {
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / width,
    scaleY: pixelHeight / height,
  };
};
