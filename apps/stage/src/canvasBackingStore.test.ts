import { describe, expect, it } from "vitest";
import { canvasBackingStoreForV1 } from "./canvasBackingStore";

describe("canvasBackingStoreForV1", () => {
  it("covers fractional CSS dimensions without leaving a physical edge column", () => {
    const backing = canvasBackingStoreForV1(971.0007, 784.8302, 2);

    expect(backing.pixelWidth).toBe(1943);
    expect(backing.pixelHeight).toBe(1570);
    expect(backing.scaleX * 971.0007).toBeCloseTo(1943, 10);
    expect(backing.scaleY * 784.8302).toBeCloseTo(1570, 10);
  });

  it("keeps integral CSS dimensions at the requested scale", () => {
    expect(canvasBackingStoreForV1(1920, 1080, 2)).toEqual({
      pixelWidth: 3840,
      pixelHeight: 2160,
      scaleX: 2,
      scaleY: 2,
    });
  });

  it("caps 5K Retina canvases to a bounded 4K-class backing store", () => {
    const backing = canvasBackingStoreForV1(5120, 2880, 2);

    expect(backing.pixelWidth).toBeLessThanOrEqual(4096);
    expect(backing.pixelHeight).toBeLessThanOrEqual(4096);
    expect(backing.pixelWidth * backing.pixelHeight).toBeLessThanOrEqual((3840 * 2160) + 4096);
    expect(backing.scaleX).toBeCloseTo(backing.scaleY, 3);
  });
});
