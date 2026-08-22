export interface CanvasBackingStoreV1 {
  pixelWidth: number;
  pixelHeight: number;
  scaleX: number;
  scaleY: number;
}

export const canvasBackingStoreForV1 = (
  cssWidth: number,
  cssHeight: number,
  requestedScale: number,
): CanvasBackingStoreV1 => {
  const width = Math.max(1, Number.isFinite(cssWidth) ? cssWidth : 1);
  const height = Math.max(1, Number.isFinite(cssHeight) ? cssHeight : 1);
  const scale = Math.max(1, Number.isFinite(requestedScale) ? requestedScale : 1);
  const pixelWidth = Math.max(1, Math.ceil(width * scale));
  const pixelHeight = Math.max(1, Math.ceil(height * scale));
  return {
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / width,
    scaleY: pixelHeight / height,
  };
};
