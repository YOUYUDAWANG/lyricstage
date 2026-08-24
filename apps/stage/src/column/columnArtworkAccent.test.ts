import { describe, expect, it } from "vitest";
import { columnArtworkAccentFromPixels } from "./columnArtworkAccent";

describe("columnArtworkAccentFromPixels", () => {
  it("prefers a chromatic midtone over a flat dark pixel", () => {
    const accent = columnArtworkAccentFromPixels(new Uint8ClampedArray([
      8, 8, 8, 255,
      210, 54, 132, 255,
    ]));
    expect(accent?.primary).toBe("rgb(210 54 132)");
    expect(accent?.ground).toBe("rgb(44 20 32)");
  });

  it("ignores transparent pixels and returns null without visible artwork", () => {
    expect(columnArtworkAccentFromPixels(new Uint8ClampedArray([255, 0, 0, 0]))).toBeNull();
  });
});
