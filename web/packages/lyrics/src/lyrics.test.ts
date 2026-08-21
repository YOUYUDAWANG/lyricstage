import { describe, expect, it, vi } from "vitest";
import {
  isSafeAutomaticMatch,
  lyricsLookupTimeoutMilliseconds,
  lookupResponseContainsCandidate,
  lookupLRCLibLyrics,
  rankedLRCLibCandidates,
  type LyricsLookupTrackV0,
} from "./index";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "ZmCRFGcON-I",
  title: "You & 合図",
  artist: "音乃瀬奏",
  durationMs: 159_000,
};

const record = (overrides: Record<string, unknown> = {}) => ({
  id: 35193797,
  trackName: "You & 合図",
  artistName: "音乃瀬奏",
  albumName: "You & 合図",
  duration: 159,
  instrumental: false,
  syncedLyrics: "[00:10.16]目覚めの合図\n[00:12.79]スマホが踊る",
  ...overrides,
});

describe("LRCLIB automatic lyrics", () => {
  it("accepts the real You & 合図 identity and rejects a different recording", () => {
    const [candidate] = rankedLRCLibCandidates(track, [record()]);
    expect(candidate).toBeDefined();
    expect(isSafeAutomaticMatch(track, candidate!)).toBe(true);
    expect(isSafeAutomaticMatch(track, { ...candidate!, durationMs: 176_000 })).toBe(false);
    expect(isSafeAutomaticMatch(track, { ...candidate!, artist: "別の歌手" })).toBe(false);
  });

  it("filters instrumental and untimed rows, then ranks exact duration first", () => {
    const candidates = rankedLRCLibCandidates(track, [
      record({ id: 1, duration: 176 }),
      record({ id: 2, instrumental: true }),
      record({ id: 3, syncedLyrics: null }),
      record({ id: 4, duration: 159 }),
    ]);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["4", "1"]);
  });

  it("accepts only the exact candidate previously issued for the same lookup response", () => {
    const [candidate] = rankedLRCLibCandidates(track, [record()]);
    const response = {
      type: "lyrics-lookup-result" as const,
      version: "lyrics-lookup-v0" as const,
      trackID: track.trackID,
      status: "candidates" as const,
      source: "network" as const,
      candidates: [candidate!],
    };
    expect(lookupResponseContainsCandidate(response, candidate!)).toBe(true);
    expect(lookupResponseContainsCandidate(response, { ...candidate!, syncedLyrics: "[00:00.00]wrong" })).toBe(false);
    expect(lookupResponseContainsCandidate(response, { ...candidate!, id: "other" })).toBe(false);
    expect(lookupResponseContainsCandidate(response, {
      ...candidate!,
      wordTimedDocument: {
        version: "lyric-document-v0",
        recordingID: "lyricsCandidate:lrclib:35193797",
        durationMs: track.durationMs,
        lines: [{
          lineIndex: 0,
          fromMs: 10_160,
          toMs: 12_790,
          text: "目覚めの合図",
          words: [{ wordIndex: 0, fromMs: 10_160, toMs: 12_790, text: "目覚めの合図" }],
        }],
      },
    })).toBe(false);
  });

  it("uses the strict metadata endpoint before search", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(record()), { status: 200 }),
    );
    try {
      const response = await lookupLRCLibLyrics(track);
      expect(response.status).toBe("match");
      expect(response.match?.id).toBe("35193797");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/get");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("returns bounded candidates instead of silently adopting a mismatch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      return Promise.resolve(url.pathname === "/api/get"
        ? new Response("", { status: 404 })
        : new Response(JSON.stringify([record({ id: 8, artistName: "別の歌手" })]), { status: 200 }));
    });
    try {
      const response = await lookupLRCLibLyrics(track);
      expect(response.status).toBe("candidates");
      expect(response.match).toBeUndefined();
      expect(response.candidates).toHaveLength(1);
      expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("q") === track.title)).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("falls back to a title-only query when the YouTube artist is a cover performer", async () => {
    const coverTrack = { ...track, title: "You & 合図 (Cover)", artist: "別の歌い手" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/get" || url.searchParams.has("artist_name")) {
        return Promise.resolve(url.pathname === "/api/get"
          ? new Response("", { status: 404 })
          : new Response("[]", { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([record()]), { status: 200 }));
    });
    try {
      const response = await lookupLRCLibLyrics(coverTrack);
      expect(response.status).toBe("candidates");
      expect(response.candidates[0]?.title).toBe("You & 合図");
      expect(response.match).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("aborts a stalled lookup at the bounded network deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    );
    try {
      const lookup = lookupLRCLibLyrics(track);
      const rejected = expect(lookup).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(lyricsLookupTimeoutMilliseconds);
      await rejected;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });
});
