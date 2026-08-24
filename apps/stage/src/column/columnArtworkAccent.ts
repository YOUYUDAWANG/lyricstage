const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export const columnArtworkAccentFromPixels = (
  pixels: Uint8ClampedArray,
): { primary: string; secondary: string; ground: string } | null => {
  let bestScore = -1;
  let best: [number, number, number] | null = null;

  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] / 255;
    if (alpha < 0.5) continue;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max - min;
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    const midtone = 1 - Math.min(1, Math.abs(luminance - 0.58) * 1.7);
    const score = chroma * 1.35 + midtone * 64 + alpha * 12;
    if (score > bestScore) {
      bestScore = score;
      best = [red, green, blue];
    }
  }

  if (!best) return null;
  const [red, green, blue] = best;
  const lift = Math.max(red, green, blue) < 176 ? 1.22 : 1;
  const primary = [red, green, blue].map((channel) => clampByte(channel * lift)) as [number, number, number];
  const secondary = primary.map((channel) => clampByte(channel * 0.58 + 255 * 0.42)) as [number, number, number];
  const ground = primary.map((channel) => clampByte(channel * 0.15 + 12)) as [number, number, number];
  return {
    primary: `rgb(${primary.join(" ")})`,
    secondary: `rgb(${secondary.join(" ")})`,
    ground: `rgb(${ground.join(" ")})`,
  };
};
