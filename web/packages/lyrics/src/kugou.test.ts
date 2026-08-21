import { describe, expect, it, vi } from "vitest";
import { lookupKugouLyrics, type LyricsLookupTrackV0 } from "./index";

const track: LyricsLookupTrackV0 = {
  provider: "youtubeMusic",
  trackID: "video",
  title: "始まりの合図",
  artist: "佐藤史果",
  durationMs: 240_000,
};

describe("Kugou lyrics fallback", () => {
  it("resolves search metadata into a synchronized LRC candidate", async () => {
    const lrc = "[00:13.78]Oh……\n[00:25.92]急に黙った横顔";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.hostname === "mobilecdn.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({
          data: { info: [{ hash: "hash", filename: "佐藤史果 - 始まりの合図", duration: 240 }] },
        }), { status: 200 }));
      }
      if (url.hostname === "krcs.kugou.com") {
        return Promise.resolve(new Response(JSON.stringify({
          candidates: [{ id: "lyric", accesskey: "access" }],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        content: Buffer.from(lrc).toString("base64"),
      }), { status: 200 }));
    });
    try {
      const candidates = await lookupKugouLyrics(track);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ provider: "kugou", id: "hash", title: "始まりの合図" });
      expect(candidates[0]?.syncedLyrics).toContain("[00:25.92]");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
