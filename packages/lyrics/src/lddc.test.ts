import { describe, expect, it, vi } from "vitest";
import { buildLyricsLookupIdentity, lookupLDDCLyrics, type LyricsLookupTrackV0 } from "./index";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "video",
  title: "You & 合図",
  artist: "音乃瀬奏",
  durationMs: 159_000,
};

describe("private LDDC lyrics fallback", () => {
  it("accepts lrcmux as the private gateway fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      candidates: [{
        source: "lrcmux",
        id: "kugou:mux-1",
        title: "One",
        artist: "Artist",
        durationSeconds: 180,
        timingKind: "line",
        lyricLines: [{ startMilliseconds: 1000, endMilliseconds: 2400, text: "One line", words: [] }],
      }],
    }), { status: 200 })));

    const candidates = await lookupLDDCLyrics(track, { endpoint: "https://lyrics.example/", token: "secret" });

    expect(candidates[0]).toMatchObject({ provider: "lrcmux", timingKind: "line" });
  });

  it("accepts Apple Music word timing from the private gateway", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      candidates: [{
        source: "applemusic",
        id: "am-1",
        title: "One",
        artist: "Artist",
        durationSeconds: 180,
        timingKind: "word",
        lyricLines: [{
          startMilliseconds: 1000,
          endMilliseconds: 2400,
          text: "I'll be there",
          words: [
            { startMilliseconds: 1000, endMilliseconds: 1500, text: "I'll" },
            { startMilliseconds: 1500, endMilliseconds: 1800, text: "be" },
            { startMilliseconds: 1800, endMilliseconds: 2400, text: "there" },
          ],
        }],
      }],
    }), { status: 200 })));

    const candidates = await lookupLDDCLyrics(track, { endpoint: "https://lyrics.example/", token: "secret" });

    expect(candidates[0]?.provider).toBe("applemusic");
    expect(candidates[0]?.timingKind).toBe("word");
    expect(candidates[0]?.wordTimedDocument?.lines[0]?.words?.map((word) => word.text)).toEqual(["I'll", "be", "there"]);
  });

  it("keeps the bearer out of source data and converts validated lines to LRC", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      candidates: [{
        source: "kugou",
        id: "42",
        title: "You & 合図",
        artist: "音乃瀬奏",
        durationSeconds: 159,
        timingKind: "word",
        lyricLines: [
          {
            startMilliseconds: 10_160,
            endMilliseconds: 12_000,
            text: "目覚めの合図",
            words: [
              { startMilliseconds: 10_160, endMilliseconds: 10_520, text: "目" },
              { startMilliseconds: 10_520, endMilliseconds: 11_050, text: "覚め" },
              { startMilliseconds: 11_050, endMilliseconds: 11_260, text: "の" },
              { startMilliseconds: 11_260, endMilliseconds: 12_000, text: "合図" },
            ],
          },
        ],
      }],
    }), { status: 200 }));
    try {
      const candidates = await lookupLDDCLyrics(track, { endpoint: "http://100.64.0.1:8788/", token: "secret" });
      expect(candidates[0]?.syncedLyrics).toBe("[00:10.160]目覚めの合図");
      expect(candidates[0]?.timingKind).toBe("word");
      expect(candidates[0]?.wordTimedDocument?.lines[0]?.words).toEqual([
        { wordIndex: 0, fromMs: 10_160, toMs: 10_520, text: "目" },
        { wordIndex: 1, fromMs: 10_520, toMs: 11_050, text: "覚め" },
        { wordIndex: 2, fromMs: 11_050, toMs: 11_260, text: "の" },
        { wordIndex: 3, fromMs: 11_260, toMs: 12_000, text: "合図" },
      ]);
      const init = fetchMock.mock.calls[0]?.[1];
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret");
      expect(String(init?.body)).not.toContain("secret");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects malformed word timing instead of silently installing a false逐字 axis", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      candidates: [{
        source: "kugou",
        id: "bad-word",
        title: "You & 合図",
        artist: "音乃瀬奏",
        durationSeconds: 159,
        timingKind: "word",
        lyricLines: [{
          startMilliseconds: 10_160,
          endMilliseconds: 12_000,
          text: "目覚めの合図",
          words: [{ startMilliseconds: 9_000, endMilliseconds: 10_000, text: "目覚め" }],
        }],
      }],
    }), { status: 200 }));
    try {
      const candidates = await lookupLDDCLyrics(track, { endpoint: "http://100.64.0.1:8788/", token: "secret" });
      expect(candidates).toEqual([]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("can issue a distinct original-artist fallback after a cover lookup", async () => {
    const coverTrack: LyricsLookupTrackV0 = {
      provider: "youtubeMusic",
      trackID: "X9aN34E-f8Q",
      title: "【歌ってみた】泥中に咲く - ウォルピスカーター covered by 存流",
      artist: "存流",
      durationMs: 289_000,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      schema: "bilimusic-lddc-lyrics-v1",
      candidates: [],
    }), { status: 200 }));
    try {
      const identity = buildLyricsLookupIdentity(coverTrack);
      await lookupLDDCLyrics(
        coverTrack,
        { endpoint: "http://100.64.0.1:8788/", token: "secret" },
        undefined,
        identity,
        identity.originalArtists,
      );
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
        requestID?: string;
        title?: string;
        artists?: string[];
      };
      expect(body).toMatchObject({
        requestID: "youtube:X9aN34E-f8Q:automatic:original",
        title: "泥中に咲く",
        artists: ["ウォルピスカーター"],
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
