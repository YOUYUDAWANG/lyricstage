import { describe, expect, it } from "vitest";
import {
  canEnterEmbeddedFullscreen,
  embeddedFullscreenSurface,
  fullscreenOwnershipConfirmed,
} from "./embeddedFullscreen";

describe("embeddedFullscreen gates", () => {
  it("blocks fullscreen entry without matched lyrics", () => {
    expect(canEnterEmbeddedFullscreen(false)).toBe(false);
    expect(canEnterEmbeddedFullscreen(true)).toBe(true);
  });

  it("requires confirmed browser fullscreen ownership before switching presentation", () => {
    const host = {};
    expect(fullscreenOwnershipConfirmed(host, host, null, false)).toBe(true);
    expect(fullscreenOwnershipConfirmed(host, null, host, false)).toBe(true);
    expect(fullscreenOwnershipConfirmed(host, null, null, true)).toBe(true);
    expect(fullscreenOwnershipConfirmed(host, null, null, false)).toBe(false);
  });

  it("keeps the fullscreen surface alive while replacement lyrics are loading", () => {
    expect(embeddedFullscreenSurface("fullscreen", false)).toBe("transition");
    expect(embeddedFullscreenSurface("fullscreen", true)).toBe("stage");
    expect(embeddedFullscreenSurface("column", false)).toBe("hidden");
  });
});
