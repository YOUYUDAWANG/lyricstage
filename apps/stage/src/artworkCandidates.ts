export const artworkCandidates = (value?: string): string[] => {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return [];
    const candidates: string[] = [];
    if (url.hostname === "i.ytimg.com") {
      const match = url.pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//u);
      if (match) {
        const videoID = match[1];
        candidates.push(
          `https://i.ytimg.com/vi/${videoID}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${videoID}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${videoID}/hqdefault.jpg`,
        );
      }
    } else if (url.hostname === "yt3.googleusercontent.com") {
      const highResolution = new URL(url.href);
      highResolution.pathname = highResolution.pathname.replace(/=w\d+-h\d+(?=-|$)/u, "=w1200-h1200");
      candidates.push(highResolution.href);
    }
    candidates.push(url.href);
    return [...new Set(candidates)];
  } catch {
    return [];
  }
};

export type ArtworkShapeV1 = "square" | "landscape" | "portrait";

export const artworkShapeForAspectV1 = (aspect: number): ArtworkShapeV1 => {
  if (!Number.isFinite(aspect) || aspect <= 0) return "square";
  if (aspect >= 1.28) return "landscape";
  if (aspect <= 0.82) return "portrait";
  return "square";
};
