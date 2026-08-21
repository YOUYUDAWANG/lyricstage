import type { LyricDocumentV0, LyricLineV0 } from "@lyricstage/contracts";

const timePattern = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

const toMilliseconds = (minutes: string, seconds: string): number =>
  Math.max(0, Math.round((Number(minutes) * 60 + Number(seconds)) * 1000));

export const parseLRC = (
  source: string,
  recordingID: string,
  durationMs?: number,
): LyricDocumentV0 => {
  const entries: Array<{ fromMs: number; text: string }> = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const matches = Array.from(rawLine.matchAll(timePattern));
    if (matches.length === 0) continue;
    const text = rawLine.replace(timePattern, "").trim();
    if (!text) continue;
    for (const match of matches) {
      entries.push({ fromMs: toMilliseconds(match[1], match[2]), text });
    }
  }

  entries.sort((left, right) => left.fromMs - right.fromMs || left.text.localeCompare(right.text));
  const unique = entries.filter(
    (entry, index) =>
      index === 0 ||
      entry.fromMs !== entries[index - 1].fromMs ||
      entry.text !== entries[index - 1].text,
  );

  if (unique.length === 0) {
    throw new Error("这份 LRC 没有可用的时间轴歌词");
  }

  const lastFromMs = unique[unique.length - 1].fromMs;
  const normalizedDurationMs = durationMs === undefined ? undefined : Math.max(1, Math.round(durationMs));
  const resolvedDuration = normalizedDurationMs === undefined
    ? lastFromMs + 8000
    : Math.max(normalizedDurationMs, lastFromMs + 1);
  const lines: LyricLineV0[] = unique.map((entry, index) => {
    const next = unique[index + 1]?.fromMs ?? resolvedDuration;
    return {
      lineIndex: index,
      fromMs: entry.fromMs,
      toMs: Math.max(entry.fromMs + 1, next),
      text: entry.text,
      voiceRole: "lead",
    };
  });

  return {
    version: "lyric-document-v0",
    recordingID,
    durationMs: resolvedDuration,
    lines,
  };
};
