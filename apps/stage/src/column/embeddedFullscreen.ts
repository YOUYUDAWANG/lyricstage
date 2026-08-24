/** Pure helpers for embedded fullscreen gating (gesture path lives in App). */

export const canEnterEmbeddedFullscreen = (hasMatchingLyrics: boolean): boolean =>
  hasMatchingLyrics;

export const fullscreenOwnershipConfirmed = <T>(
  candidate: T,
  documentFullscreenElement: T | null,
  shadowFullscreenElement: T | null,
  matchesFullscreenPseudoClass: boolean,
): boolean => matchesFullscreenPseudoClass
  || documentFullscreenElement === candidate
  || shadowFullscreenElement === candidate;

export type EmbeddedFullscreenSurface = "hidden" | "stage" | "transition";

export const embeddedFullscreenSurface = (
  presentation: "column" | "fullscreen",
  hasMatchingLyrics: boolean,
): EmbeddedFullscreenSurface => {
  if (presentation !== "fullscreen") return "hidden";
  return hasMatchingLyrics ? "stage" : "transition";
};
