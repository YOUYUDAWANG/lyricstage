import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { artworkCandidates, artworkShapeForAspectV1 } from "./artworkCandidates";

describe("artworkCandidates", () => {
  it("prefers the real YouTube max-resolution image and keeps safe fallbacks", () => {
    expect(artworkCandidates(
      "https://i.ytimg.com/vi/video-id/hqdefault.jpg?sqp=tiny",
    )).toEqual([
      "https://i.ytimg.com/vi/video-id/maxresdefault.jpg",
      "https://i.ytimg.com/vi/video-id/sddefault.jpg",
      "https://i.ytimg.com/vi/video-id/hqdefault.jpg",
      "https://i.ytimg.com/vi/video-id/hqdefault.jpg?sqp=tiny",
    ]);
  });

  it("upgrades YouTube Music square art without accepting insecure URLs", () => {
    expect(artworkCandidates(
      "https://yt3.googleusercontent.com/cover=w60-h60-l90-rj",
    )[0]).toBe("https://yt3.googleusercontent.com/cover=w1200-h1200-l90-rj");
    expect(artworkCandidates("http://example.com/cover.jpg")).toEqual([]);
  });

  it("preserves square, video-landscape and portrait artwork geometry", () => {
    expect(artworkShapeForAspectV1(1)).toBe("square");
    expect(artworkShapeForAspectV1(16 / 9)).toBe("landscape");
    expect(artworkShapeForAspectV1(3 / 4)).toBe("portrait");
    expect(artworkShapeForAspectV1(Number.NaN)).toBe("square");
  });

  it("renders artwork as the material instead of mounting it on a glass plate", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const frameRule = css.match(/(?:^|\n)\.stage-artwork-frame \{([\s\S]*?)\n\}/u)?.[1] ?? "";
    expect(frameRule).toContain("background: transparent");
    expect(frameRule).not.toMatch(/inset|backdrop-filter|color-mix/u);
    expect(css).not.toContain(".stage-artwork-frame::after");
    expect(css).not.toMatch(/inset 0 0 0 1px rgba\(255, 255, 255/u);
  });
});
