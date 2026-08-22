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
});
