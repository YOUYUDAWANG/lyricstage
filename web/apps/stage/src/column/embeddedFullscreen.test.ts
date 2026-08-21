import { describe, expect, it } from "vitest";
import {
  activeScrollKey,
  canEnterEmbeddedFullscreen,
  embeddedFullscreenSurface,
  shouldScrollForActiveChange,
} from "./embeddedFullscreen";

describe("embeddedFullscreen gates", () => {
  it("blocks fullscreen entry without matched lyrics", () => {
    expect(canEnterEmbeddedFullscreen(false)).toBe(false);
    expect(canEnterEmbeddedFullscreen(true)).toBe(true);
  });

  it("keeps the fullscreen surface alive while replacement lyrics are loading", () => {
    expect(embeddedFullscreenSurface("fullscreen", false)).toBe("transition");
    expect(embeddedFullscreenSurface("fullscreen", true)).toBe("stage");
    expect(embeddedFullscreenSurface("column", false)).toBe("hidden");
  });

  it("scrolls only when the active line key changes", () => {
    expect(activeScrollKey([3, 1])).toBe("1,3");
    expect(shouldScrollForActiveChange("1", "1", false)).toBe(false);
    expect(shouldScrollForActiveChange("1", "2", false)).toBe(true);
    expect(shouldScrollForActiveChange("1", "2", true)).toBe(false);
    expect(shouldScrollForActiveChange("", "2", false)).toBe(true);
  });
});
