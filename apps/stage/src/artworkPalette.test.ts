import { describe, expect, it } from "vitest";
import { directedPaletteForIndexV1 } from "@lyricstage/renderer";
import {
  extractArtworkPaletteV1,
  mergeArtworkDirectorPaletteV1,
  paletteToneForV1,
} from "./artworkPalette";

const buffer = (colors: Array<[number, number, number]>) => ({
  width: colors.length,
  height: 1,
  data: new Uint8ClampedArray(colors.flatMap(([red, green, blue]) => [red, green, blue, 255])),
});

describe("extractArtworkPaletteV1", () => {
  it("lets a small vivid cover color steer a mostly dark artwork", () => {
    const palette = extractArtworkPaletteV1(buffer([
      ...Array.from({ length: 60 }, (): [number, number, number] => [8, 7, 15]),
      ...Array.from({ length: 24 }, (): [number, number, number] => [224, 52, 135]),
      ...Array.from({ length: 12 }, (): [number, number, number] => [52, 104, 220]),
    ]));
    expect(palette).toBeDefined();
    expect(palette?.ground).not.toBe("#120a07");
    expect(palette?.signal).not.toBe(palette?.signalAlt);
    expect(palette?.ink).toMatch(/^#[0-9a-f]{6}$/u);
    expect(palette && paletteToneForV1(palette)).toBe("dark");
  });

  it("preserves the airy luminance character of a bright blue-white cover", () => {
    const palette = extractArtworkPaletteV1(buffer([
      ...Array.from({ length: 48 }, (): [number, number, number] => [236, 244, 252]),
      ...Array.from({ length: 30 }, (): [number, number, number] => [92, 170, 242]),
      ...Array.from({ length: 14 }, (): [number, number, number] => [126, 108, 218]),
      ...Array.from({ length: 8 }, (): [number, number, number] => [245, 208, 96]),
    ]));
    expect(palette).toBeDefined();
    expect(palette && paletteToneForV1(palette)).toBe("light");
    expect(palette?.ink).not.toBe("#ffffff");
  });

  it("produces a restrained neutral system for grayscale artwork", () => {
    const palette = extractArtworkPaletteV1(buffer([
      ...Array.from({ length: 40 }, (): [number, number, number] => [18, 18, 20]),
      ...Array.from({ length: 20 }, (): [number, number, number] => [188, 188, 190]),
    ]));
    expect(palette).toBeDefined();
    expect(palette?.ground).toMatch(/^#[0-9a-f]{6}$/u);
    expect(palette?.veil).toMatch(/^rgba\(/u);
  });

  it("uses a light neutral surface for bright grayscale artwork", () => {
    const palette = extractArtworkPaletteV1(buffer([
      ...Array.from({ length: 70 }, (): [number, number, number] => [230, 232, 235]),
      ...Array.from({ length: 30 }, (): [number, number, number] => [164, 168, 174]),
    ]));
    expect(palette && paletteToneForV1(palette)).toBe("light");
  });

  it("treats bright cover edges as background even when the central subject is dark", () => {
    const colors: Array<[number, number, number]> = Array.from({ length: 25 }, (_value, index) => {
      const x = index % 5;
      const y = Math.floor(index / 5);
      return x >= 1 && x <= 3 && y >= 1 && y <= 3
        ? [24, 30, 58]
        : [224, 238, 250];
    });
    const palette = extractArtworkPaletteV1({
      width: 5,
      height: 5,
      data: new Uint8ClampedArray(colors.flatMap(([red, green, blue]) => [red, green, blue, 255])),
    });
    expect(palette && paletteToneForV1(palette)).toBe("light");
  });

  it("rejects an empty pixel buffer", () => {
    expect(extractArtworkPaletteV1({ data: new Uint8ClampedArray(), width: 0, height: 0 })).toBeUndefined();
  });

  it("lets an AI section steer accents without discarding the artwork tone", () => {
    const artwork = extractArtworkPaletteV1(buffer([
      ...Array.from({ length: 48 }, (): [number, number, number] => [241, 210, 218]),
      ...Array.from({ length: 30 }, (): [number, number, number] => [228, 72, 132]),
      ...Array.from({ length: 22 }, (): [number, number, number] => [244, 184, 82]),
    ]));
    expect(artwork).toBeDefined();
    const directed = directedPaletteForIndexV1(7);
    const merged = mergeArtworkDirectorPaletteV1(artwork!, directed, 0.9);
    expect(merged.signal).not.toBe(artwork?.signal);
    expect(merged.signalAlt).not.toBe(artwork?.signalAlt);
    expect(merged.ground).not.toBe(directed.ground);
    expect(paletteToneForV1(merged)).toBe(paletteToneForV1(artwork!));
  });
});
