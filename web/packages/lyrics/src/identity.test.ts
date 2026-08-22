import { describe, expect, it } from "vitest";
import {
  buildLyricsLookupIdentity,
  identityCandidateScore,
  isRelevantIdentityCandidate,
  isSafeIdentityMatch,
  preferredOriginalFallbackCandidate,
  type LyricsCandidateV0,
  type LyricsLookupTrackV0,
} from "./index";

const track = (title: string, artist = "花譜 - Topic"): LyricsLookupTrackV0 => ({
  provider: "youtubeMusic",
  trackID: "video",
  title,
  artist,
  durationMs: 245_000,
});

const candidate = (artist: string, overrides: Partial<LyricsCandidateV0> = {}): LyricsCandidateV0 => ({
  provider: "lrclib",
  id: "1",
  title: "夏夜のマジック",
  artist,
  durationMs: 245_000,
  syncedLyrics: "[00:01.00]test",
  ...overrides,
});

describe("YouTube Music lyric identity", () => {
  it("removes packaging while retaining original-script and translated aliases", () => {
    const identity = buildLyricsLookupIdentity(track("【歌ってみた】《夏夜のマジック/夏夜的魔法》 Official MV"));
    expect(identity.canonicalTitle).toBe("夏夜のマジック");
    expect(identity.titles).toContain("夏夜的魔法");
    expect(identity.coverPerformers).toContain("花譜");
    expect(identity.isCover).toBe(true);
  });

  it("does not silently adopt the original recording for a detected cover", () => {
    const identity = buildLyricsLookupIdentity(track("夏夜のマジック (Cover)"));
    expect(isSafeIdentityMatch(track("夏夜のマジック (Cover)"), identity, candidate("indigo la End"))).toBe(false);
    expect(isSafeIdentityMatch(track("夏夜のマジック (Cover)"), identity, candidate("花譜"))).toBe(true);
  });

  it("strips a trailing performer credit from a cover title", () => {
    const identity = buildLyricsLookupIdentity(track("【歌ってみた】修羅 by 花譜", "花譜"));
    expect(identity).toMatchObject({
      canonicalTitle: "修羅",
      coverPerformers: ["花譜"],
      originalArtists: [],
      isCover: true,
    });
  });

  it.each([
    ["春を告げる（yama）/ acoustic cover.", "鹿乃", "春を告げる", "yama"],
    ["【歌ってみた】泥中に咲く - ウォルピスカーター covered by 存流", "存流", "泥中に咲く", "ウォルピスカーター"],
    ["【歌ってみた】鏡面の波 - YURiKA covered by 存流", "存流", "鏡面の波", "YURiKA"],
    ["残響散歌 / Aimer - Cover by 存流", "存流", "残響散歌", "Aimer"],
    ["【歌ってみた】Gimme×Gimme - 八王子P × Giga covered by 存流", "存流", "Gimme×Gimme", "八王子P × Giga"],
  ])("separates cover title, credited original artist, and performer: %s", (
    title,
    artist,
    expectedTitle,
    expectedOriginalArtist,
  ) => {
    const identity = buildLyricsLookupIdentity(track(title, artist));
    expect(identity.canonicalTitle).toBe(expectedTitle);
    expect(identity.originalArtists).toContain(expectedOriginalArtist);
    expect(identity.coverPerformers).toContain(artist);
  });

  it.each([
    ["【歌ってみた】死別 / covered by 明石繆", "明石繆"],
    ["〖歌ってみた〗死別 / covered by 明石繆", "明石繆"],
    ["死別／Cover：明石繆", "明石繆"],
    ["【歌ってみた】死別 | Vocal: 明石繆", "明石繆"],
  ])("parses the common title / covered-by-performer grammar: %s", (title, artist) => {
    const identity = buildLyricsLookupIdentity(track(title, artist));
    expect(identity).toMatchObject({
      canonicalTitle: "死別",
      coverPerformers: [artist],
      originalArtists: [],
      isCover: true,
    });
  });

  it("does not mistake an ordinary title ending in by for a performer credit", () => {
    const identity = buildLyricsLookupIdentity(track("Stand by Me", "Ben E. King"));
    expect(identity.canonicalTitle).toBe("Stand by Me");
    expect(identity.isCover).toBe(false);
  });

  it.each([
    {
      title: "DECO*27 - ハートアラモード feat. 初音ミク",
      artist: "U/M/A/A Inc.",
      canonicalTitle: "ハートアラモード",
      originals: ["DECO*27", "初音ミク"],
      performers: [],
      isCover: false,
    },
    {
      title: "Justin Bieber - Peaches ft. Daniel Caesar, Giveon /東 雪蓮 (cover)",
      artist: "東 雪蓮",
      canonicalTitle: "Peaches",
      originals: ["Justin Bieber", "Daniel Caesar", "Giveon"],
      performers: ["東 雪蓮"],
      isCover: true,
    },
    {
      title: "さようなら、花泥棒さん /東 雪蓮(cover)",
      artist: "東 雪蓮",
      canonicalTitle: "さようなら、花泥棒さん",
      originals: [],
      performers: ["東 雪蓮"],
      isCover: true,
    },
    {
      title: "mosi mosi? (楽音) ／ダズビー COVER",
      artist: "ダズビー",
      canonicalTitle: "mosi mosi?",
      originals: ["楽音"],
      performers: ["ダズビー"],
      isCover: true,
    },
    {
      title: "不可幸力 - Vaundy Covered by 理芽 / RIM (2024)｜from 神椿",
      artist: "理芽",
      canonicalTitle: "不可幸力",
      originals: ["Vaundy"],
      performers: ["理芽", "RIM"],
      isCover: true,
    },
    {
      title: "nekomeshi - やくしまるえつこ (cover)｜somunia",
      artist: "somunia",
      canonicalTitle: "nekomeshi",
      originals: ["やくしまるえつこ"],
      performers: ["somunia"],
      isCover: true,
    },
    {
      title: "「セプテンバーさん」 - 音乃瀬奏（cover）",
      artist: "音乃瀬奏",
      canonicalTitle: "セプテンバーさん",
      originals: [],
      performers: ["音乃瀬奏"],
      isCover: true,
    },
    {
      title: "プロポーズ/ なとり cover 9Lana",
      artist: "9Lana",
      canonicalTitle: "プロポーズ",
      originals: ["なとり"],
      performers: ["9Lana"],
      isCover: true,
    },
    {
      title: "ありふれたしあわせ / 歌 : 黒騎れい (CV : 内田真礼)",
      artist: "黒騎れい",
      canonicalTitle: "ありふれたしあわせ",
      originals: ["黒騎れい", "内田真礼"],
      performers: [],
      isCover: false,
    },
    {
      title: "【デレステMV】O-Ku-Ri-Mo-No Sunday！(Full ver.)　久川颯、久川凪【4K】",
      artist: "playlist channel",
      canonicalTitle: "O-Ku-Ri-Mo-No Sunday!",
      originals: ["久川颯", "久川凪"],
      performers: [],
      isCover: false,
    },
  ])("parses playlist role grammar instead of uploader punctuation: $title", ({
    title,
    artist,
    canonicalTitle,
    originals,
    performers,
    isCover,
  }) => {
    const identity = buildLyricsLookupIdentity(track(title, artist));
    expect(identity.canonicalTitle).toBe(canonicalTitle);
    expect(identity.originalArtists).toEqual(expect.arrayContaining(originals));
    expect(identity.coverPerformers).toEqual(expect.arrayContaining(performers));
    expect(identity.isCover).toBe(isCover);
  });

  it.each([
    ["Wildest Flower", "Wildest Flower"],
    ["灰とよすが（feat. 日和る）", "灰とよすが"],
    ["憧れをいっぱい (Tomggg Remix)", "憧れをいっぱい"],
    ["One In A Billion -Wake Up, Girls!ver.-", "One In A Billion -Wake Up, Girls!ver.-"],
    ["Silent Star (2021 Remastered Version)", "Silent Star"],
    ["愛のまま (Cover Live)", "愛のまま"],
    ["14平米にスーベニア (GAME VERSION)", "14平米にスーベニア"],
    ["Holiday∞Holiday", "Holiday∞Holiday"],
  ])("keeps ordinary playlist titles conservative: %s", (title, canonicalTitle) => {
    expect(buildLyricsLookupIdentity(track(title, "playlist artist")).canonicalTitle).toBe(canonicalTitle);
  });

  it("prefers the cover recording and requires a proven original artist for fallback", () => {
    const coverTrack = track("【歌ってみた】修羅 by 花譜", "花譜");
    const identity = buildLyricsLookupIdentity(coverTrack);
    const cover = candidate("花譜", { id: "cover", title: "修羅", durationMs: 245_000 });
    const original = candidate("ヨルシカ", { id: "original", title: "修羅", durationMs: 236_000 });
    expect(identityCandidateScore(coverTrack, identity, cover)).toBeGreaterThan(
      identityCandidateScore(coverTrack, identity, original),
    );
    expect(preferredOriginalFallbackCandidate(coverTrack, identity, [original])).toBeUndefined();
    const groundedIdentity = { ...identity, originalArtists: ["ヨルシカ"] };
    expect(preferredOriginalFallbackCandidate(coverTrack, groundedIdentity, [original])).toBe(original);
    expect(preferredOriginalFallbackCandidate(coverTrack, identity, [
      original,
      candidate("DOES", { id: "other", title: "修羅", durationMs: 240_000 }),
    ])).toBeUndefined();
    expect(preferredOriginalFallbackCandidate(coverTrack, groundedIdentity, [
      candidate("Yorushika", { id: "roman", title: "修羅", durationMs: 236_000 }),
      original,
      candidate("ヨルシカ", { id: "original-2", title: "修羅", durationMs: 236_000 }),
    ])?.artist).toBe("ヨルシカ");
    expect(isRelevantIdentityCandidate(
      coverTrack,
      identity,
      candidate("DOES", { id: "distant", title: "修羅", durationMs: 205_000 }),
    )).toBe(false);
  });
});
