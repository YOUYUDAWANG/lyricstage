import { describe, expect, it, vi } from "vitest";
import {
  layeredLyricsLookupTimeoutMilliseconds,
  lddcLyricsLookupTimeoutMilliseconds,
  lookupLayeredLyrics,
  type LyricsLookupTrackV0,
} from "./index";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "video",
  title: "始まりの合図",
  artist: "佐藤史果",
  durationMs: 240_000,
};

describe("layered lyrics lookup", () => {
  it("returns an exact LRCLIB match without spending requests on a fallback source", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: 1,
      trackName: track.title,
      artistName: track.artist,
      duration: 240,
      syncedLyrics: "[00:01.00]test",
    }), { status: 200 }));
    try {
      const response = await lookupLayeredLyrics(track);
      expect(response.status).toBe("match");
      expect(response.match?.provider).toBe("lrclib");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(new URL(String(fetchMock.mock.calls[0]?.[0])).hostname).toBe("lrclib.net");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("uses Kugou only after LRCLIB has no safe candidate", async () => {
    const lrc = "[00:13.78]Oh……\n[00:25.92]急に黙った横顔";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") {
        return Promise.resolve(url.pathname === "/api/get"
          ? new Response("", { status: 404 })
          : new Response("[]", { status: 200 }));
      }
      if (url.hostname === "mobilecdn.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({
          data: { info: [{ hash: "hash", filename: "佐藤史果 - 始まりの合図", duration: 240 }] },
        }), { status: 200 }));
      }
      if (url.hostname === "krcs.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ id: "lyric", accesskey: "access" }] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ content: Buffer.from(lrc).toString("base64") }), { status: 200 }));
    });
    try {
      const response = await lookupLayeredLyrics(track);
      expect(response.status).toBe("match");
      expect(response.match?.provider).toBe("kugou");
      const hosts = fetchMock.mock.calls.map(([input]) => new URL(String(input)).hostname);
      expect(hosts.indexOf("lrclib.net")).toBeLessThan(hosts.indexOf("mobilecdn.kugou.com"));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("cleans a cover title, prefers cover lyrics, and removes unrelated songs by the performer", async () => {
    const coverTrack: LyricsLookupTrackV0 = {
      provider: "youtubeMusic",
      trackID: "jDtV2H9gXzI",
      title: "【歌ってみた】修羅 by 花譜",
      artist: "花譜",
      durationMs: 241_000,
    };
    const lrc = "[00:01.00]test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") {
        if (url.pathname === "/api/get") return Promise.resolve(new Response("", { status: 404 }));
        return Promise.resolve(new Response(JSON.stringify(
          url.searchParams.get("q") === "修羅"
            ? [{ id: 9, trackName: "修羅", artistName: "ヨルシカ", duration: 236, syncedLyrics: lrc }]
            : [],
        ), { status: 200 }));
      }
      if (url.hostname === "mobilecdn.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({
          data: { info: [
            { hash: "cover", filename: "花譜 - 修羅", duration: 241 },
            { hash: "unrelated", filename: "花譜 - 邂逅", duration: 330 },
          ] },
        }), { status: 200 }));
      }
      if (url.hostname === "krcs.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ id: "lyric", accesskey: "access" }] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ content: Buffer.from(lrc).toString("base64") }), { status: 200 }));
    });
    try {
      const response = await lookupLayeredLyrics(coverTrack);
      expect(response.status).toBe("match");
      expect(response.matchKind).toBe("sameRecording");
      expect(response.match).toMatchObject({ provider: "kugou", title: "修羅", artist: "花譜" });
      expect(response.candidates.map(({ title, artist }) => `${artist} - ${title}`)).toEqual([
        "花譜 - 修羅",
        "ヨルシカ - 修羅",
      ]);
      expect(fetchMock.mock.calls.some(([input]) =>
        new URL(String(input)).searchParams.get("q") === "修羅"
      )).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not guess an original artist from an unrelated candidate", async () => {
    const coverTrack: LyricsLookupTrackV0 = {
      provider: "youtubeMusic",
      trackID: "jDtV2H9gXzI",
      title: "【歌ってみた】修羅 by 花譜",
      artist: "花譜",
      durationMs: 241_000,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") {
        if (url.pathname === "/api/get") return Promise.resolve(new Response("", { status: 404 }));
        return Promise.resolve(new Response(JSON.stringify(
          url.searchParams.get("q") === "修羅"
            ? [{ id: 9, trackName: "修羅", artistName: "ヨルシカ", duration: 236, syncedLyrics: "[00:01.00]test" }]
            : [],
        ), { status: 200 }));
      }
      if (url.hostname === "mobilecdn.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({ data: { info: [] } }), { status: 200 }));
      }
      throw new Error(`unexpected request: ${url.href}`);
    });
    try {
      const response = await lookupLayeredLyrics(coverTrack);
      expect(response.status).toBe("candidates");
      expect(response.matchKind).toBeUndefined();
      expect(response.match).toBeUndefined();
      expect(response.candidates[0]).toMatchObject({ title: "修羅", artist: "ヨルシカ", durationMs: 236_000 });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("queries the credited original artist from a common covered-by title", async () => {
    const coverTrack: LyricsLookupTrackV0 = {
      provider: "youtubeMusic",
      trackID: "X9aN34E-f8Q",
      title: "【歌ってみた】泥中に咲く - ウォルピスカーター covered by 存流",
      artist: "存流",
      durationMs: 289_000,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") {
        if (url.pathname === "/api/get") return Promise.resolve(new Response("", { status: 404 }));
        const isOriginalQuery = url.searchParams.get("track_name") === "泥中に咲く" &&
          url.searchParams.get("artist_name") === "ウォルピスカーター";
        return Promise.resolve(new Response(JSON.stringify(isOriginalQuery ? [{
          id: 10,
          trackName: "泥中に咲く",
          artistName: "ウォルピスカーター",
          duration: 293,
          syncedLyrics: "[00:01.00]test",
        }] : []), { status: 200 }));
      }
      if (url.hostname === "mobilecdn.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({ data: { info: [] } }), { status: 200 }));
      }
      throw new Error(`unexpected request: ${url.href}`);
    });
    try {
      const response = await lookupLayeredLyrics(coverTrack);
      expect(response.status).toBe("match");
      expect(response.matchKind).toBe("originalFallback");
      expect(response.match).toMatchObject({ title: "泥中に咲く", artist: "ウォルピスカーター" });
      expect(fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input));
        return url.searchParams.get("track_name") === "泥中に咲く" &&
          url.searchParams.get("artist_name") === "ウォルピスカーター";
      })).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("abandons a stalled optional LDDC early and continues to a public match", async () => {
    vi.useFakeTimers();
    const observedSignals: AbortSignal[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") return Promise.resolve(new Response(JSON.stringify({
        id: 1,
        trackName: track.title,
        artistName: track.artist,
        duration: 240,
        syncedLyrics: "[00:01.00]test",
      }), { status: 200 }));
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        observedSignals.push(signal);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    try {
      const lookup = lookupLayeredLyrics(track, {
        lddc: { endpoint: "https://lyrics.example/api/", token: "secret" },
      });
      await vi.advanceTimersByTimeAsync(lddcLyricsLookupTimeoutMilliseconds);
      await expect(lookup).resolves.toMatchObject({ status: "match", match: { provider: "lrclib" } });
      expect(observedSignals).toHaveLength(1);
      expect(observedSignals[0]?.aborted).toBe(true);
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });

  it("aborts a lookup with no completed source at the whole-lookup deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }));
    try {
      const lookup = lookupLayeredLyrics(track);
      const rejected = expect(lookup).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(layeredLyricsLookupTimeoutMilliseconds);
      await rejected;
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });

  it("returns the completed-source result after aborting a stalled fallback at the deadline", async () => {
    vi.useFakeTimers();
    const kugouSignals: AbortSignal[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "lrclib.net") {
        return Promise.resolve(url.pathname === "/api/get"
          ? new Response("", { status: 404 })
          : new Response("[]", { status: 200 }));
      }
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        kugouSignals.push(signal);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    try {
      const lookup = lookupLayeredLyrics(track);
      await vi.advanceTimersByTimeAsync(layeredLyricsLookupTimeoutMilliseconds);
      await expect(lookup).resolves.toMatchObject({ status: "miss", candidates: [] });
      expect(kugouSignals.length).toBeGreaterThan(0);
      expect(kugouSignals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps earlier candidates when a later source stalls until the deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "lyrics.example") {
        return Promise.resolve(new Response(JSON.stringify({
          schema: "bilimusic-lddc-lyrics-v1",
          candidates: [{
            source: "netease",
            id: "partial",
            title: track.title,
            artist: track.artist,
            durationSeconds: 250,
            timingKind: "line",
            lyricLines: [{ startMilliseconds: 1_000, endMilliseconds: 3_000, text: "partial" }],
          }],
        }), { status: 200 }));
      }
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    try {
      const lookup = lookupLayeredLyrics(track, {
        lddc: { endpoint: "https://lyrics.example/api/", token: "secret" },
      });
      await vi.advanceTimersByTimeAsync(layeredLyricsLookupTimeoutMilliseconds);
      await expect(lookup).resolves.toMatchObject({
        status: "candidates",
        candidates: [{ provider: "netease", id: "partial" }],
      });
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });
});
