import type { LyricsCandidateV0, LyricsLookupTrackV0 } from "./types";

export interface LyricsLookupIdentityV0 {
  canonicalTitle: string;
  titles: string[];
  originalArtists: string[];
  coverPerformers: string[];
  isCover: boolean;
}

const packaging = /(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|lyrics?|歌ってみた|歌ってみました|歌いました|歌唱|弾き語り|カバー|翻唱|唱见|cover(?:ed)?|live|acoustic|arrange(?:d)?|mv|pv|4k|字幕|中字|完整版|full\s*version|remaster(?:ed)?)/iu;
const coverMarker = /(?:歌ってみた|歌ってみました|歌いました|弾き語り|カバー|翻唱|唱见|\bcover(?:ed)?\b)/iu;
const topicSuffix = /(?:\s*[-–—]\s*topic)$/iu;

export const comparableLyricsText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(topicSuffix, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const key = comparableLyricsText(trimmed);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
};

const quotedTitles = (title: string): string[] => {
  const values: string[] = [];
  for (const match of title.matchAll(/[《「『【](.+?)[》」』】]/gu)) {
    const content = match[1]?.trim();
    if (!content || packaging.test(content)) continue;
    values.push(...content.split(/[／/]/u).map((part) => part.trim()).filter(Boolean));
  }
  return values;
};

const trailingPerformerCredit = /(?:\s*[-–—|｜:：\/／]\s*)?(?:(?:cover(?:ed)?|sung)\s*(?:by\s+|[:：]\s*)(.+?)|\bby\s+(.+?)|(?:歌(?:唱)?|vocal|vo\.?)\s*[:：]\s*(.+?))[\s.。]*$/iu;
const coverSourceSeparator = /(?:\s+[-–—]\s+|\s+[|｜]\s+|\s+[\/／]\s+|\s*／\s*)/gu;
const boundarySeparators = /^[\-–—|｜:：\/／\s]+|[\-–—|｜:：\/／\s]+$/gu;

const parentheticalSourceCredit = (
  value: string,
  isCover: boolean,
): { title: string; originalArtist?: string } => {
  if (!isCover) return { title: value };
  const match = value.match(/[（(]([^()（）]{1,80})[）)](?=\s*(?:[\/／|｜]\s*)?(?:(?:acoustic|piano)\s+)?(?:cover(?:ed)?|カバー|歌ってみた))/iu);
  const originalArtist = match?.[1]?.trim();
  if (!match || match.index === undefined || !originalArtist || packaging.test(originalArtist)) {
    return { title: value };
  }
  return {
    title: `${value.slice(0, match.index)} ${value.slice(match.index + match[0].length)}`.trim(),
    originalArtist,
  };
};

const cleanTitle = (title: string, performers: string[], isCover: boolean): string => {
  let value = title.normalize("NFKC").replace(topicSuffix, "").trim();
  value = value.replace(/[\[(（【〖〘〚][^\])）】〗〙〛]*[\])）】〗〙〛]/gu, (group) => packaging.test(group) ? " " : group);
  value = value.replace(/(?:\s*[-–—|｜:：\/／]\s*)?(?:(?:acoustic|piano)\s+)?(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|lyrics?|歌ってみた|翻唱|cover(?:ed)?|mv|pv|4k|字幕|中字|full\s*version|remaster(?:ed)?)[\s.。]*$/iu, "");
  const credit = value.match(trailingPerformerCredit);
  const creditedArtistName = credit?.[1] ?? credit?.[2] ?? credit?.[3];
  if (creditedArtistName && credit) {
    const creditedArtist = comparableLyricsText(creditedArtistName);
    const creditsKnownPerformer = performers.some((performer) =>
      comparableLyricsText(performer) === creditedArtist
    );
    if (isCover || creditsKnownPerformer) value = value.slice(0, credit.index).trim();
  }
  return value.replace(/\s{2,}/gu, " ").trim().replace(boundarySeparators, "");
};

const coverSourceCredit = (
  value: string,
  performers: string[],
  isCover: boolean,
): { title: string; originalArtist?: string } => {
  if (!isCover) return { title: value };
  const separators = [...value.matchAll(coverSourceSeparator)];
  const separator = separators.at(-1);
  if (!separator || separator.index === undefined) return { title: value };
  const title = value.slice(0, separator.index).trim();
  const originalArtist = value.slice(separator.index + separator[0].length).trim();
  if (!title || !originalArtist || originalArtist.length > 160) return { title: value };
  if (performers.some((performer) => comparableLyricsText(performer) === comparableLyricsText(originalArtist))) {
    return { title: value };
  }
  return { title, originalArtist };
};

const artistNames = (artist: string): string[] => {
  const cleaned = artist.normalize("NFKC").replace(topicSuffix, "").trim();
  return unique([
    cleaned,
    ...cleaned.split(/\s*(?:\/|／|、|,|，|·|・| feat\.? | featuring )\s*/iu),
  ]);
};

const explicitOriginalArtists = (title: string): string[] => {
  const values: string[] = [];
  const patterns = [
    /(?:original(?:\s+by)?|原唱|本家)\s*[:：]\s*([^\[\]()（）【】|｜/／]+)/giu,
    /(?:cover\s+of)\s+[^\-–—]+\s+[-–—]\s*([^\[\]()（）【】|｜/／]+)/giu,
  ];
  for (const pattern of patterns) {
    for (const match of title.matchAll(pattern)) {
      if (match[1]) values.push(match[1]);
    }
  }
  return unique(values);
};

export const buildLyricsLookupIdentity = (track: LyricsLookupTrackV0): LyricsLookupIdentityV0 => {
  const rawTitle = track.title.trim();
  const isCover = coverMarker.test(rawTitle);
  const performers = artistNames(track.artist);
  const quoted = quotedTitles(rawTitle);
  const parentheticalCredit = parentheticalSourceCredit(rawTitle, isCover);
  const cleaned = cleanTitle(parentheticalCredit.title, performers, isCover);
  const sourceCredit = coverSourceCredit(cleaned, performers, isCover);
  const titles = unique([
    ...quoted,
    sourceCredit.title,
    ...(sourceCredit.title === cleaned ? [] : [cleaned]),
    rawTitle.replace(topicSuffix, "").trim(),
  ]);
  const originals = unique([
    ...explicitOriginalArtists(rawTitle),
    ...(parentheticalCredit.originalArtist ? [parentheticalCredit.originalArtist] : []),
    ...(sourceCredit.originalArtist ? [sourceCredit.originalArtist] : []),
  ]);
  return {
    canonicalTitle: titles[0] ?? rawTitle,
    titles,
    originalArtists: isCover ? originals : performers,
    coverPerformers: isCover ? performers : [],
    isCover,
  };
};

export const titleMatchesIdentity = (
  identity: LyricsLookupIdentityV0,
  candidate: LyricsCandidateV0,
): boolean => {
  const candidatePerformers = artistNames(candidate.artist);
  const candidateIsCover = identity.isCover || coverMarker.test(candidate.title);
  const cleaned = cleanTitle(
    candidate.title,
    candidatePerformers,
    candidateIsCover,
  );
  const actual = comparableLyricsText(coverSourceCredit(
    cleaned,
    candidatePerformers,
    candidateIsCover,
  ).title);
  return identity.titles.some((title) => comparableLyricsText(title) === actual);
};

export const artistMatchesAny = (expected: string[], actual: string): boolean => {
  if (expected.length === 0) return true;
  const right = comparableLyricsText(actual);
  return expected.some((value) => {
    const left = comparableLyricsText(value);
    return left === right || (left.length >= 3 && right.includes(left)) || (right.length >= 3 && left.includes(right));
  });
};

export const isSafeIdentityMatch = (
  track: LyricsLookupTrackV0,
  identity: LyricsLookupIdentityV0,
  candidate: LyricsCandidateV0,
): boolean => {
  const expectedArtists = identity.isCover ? identity.coverPerformers : identity.originalArtists;
  return titleMatchesIdentity(identity, candidate) &&
    artistMatchesAny(expectedArtists, candidate.artist) &&
    Math.abs(track.durationMs - candidate.durationMs) <= 4_000;
};

export const isRelevantIdentityCandidate = (
  track: LyricsLookupTrackV0,
  identity: LyricsLookupIdentityV0,
  candidate: LyricsCandidateV0,
): boolean => titleMatchesIdentity(identity, candidate) &&
  Math.abs(track.durationMs - candidate.durationMs) <= 30_000;

export const identityCandidateScore = (
  track: LyricsLookupTrackV0,
  identity: LyricsLookupIdentityV0,
  candidate: LyricsCandidateV0,
): number => {
  const titleMatch = titleMatchesIdentity(identity, candidate);
  const coverPerformerMatch = identity.isCover && artistMatchesAny(identity.coverPerformers, candidate.artist);
  const originalArtistMatch = identity.originalArtists.length > 0 &&
    artistMatchesAny(identity.originalArtists, candidate.artist);
  const recordingPriority = identity.isCover
    ? coverPerformerMatch ? 300 : originalArtistMatch ? 220 : 160
    : originalArtistMatch ? 300 : 0;
  const durationDelta = Math.abs(track.durationMs - candidate.durationMs);
  return (
    (titleMatch ? 1_000 + recordingPriority : 0) +
    (durationDelta <= 2_000 ? 35 : durationDelta <= 4_000 ? 25 : durationDelta <= 15_000 ? 8 : durationDelta > 30_000 ? -40 : 0)
  );
};

export const preferredOriginalFallbackCandidate = (
  track: LyricsLookupTrackV0,
  identity: LyricsLookupIdentityV0,
  candidates: LyricsCandidateV0[],
): LyricsCandidateV0 | undefined => {
  if (!identity.isCover || identity.originalArtists.length === 0) return undefined;
  const plausible = candidates.filter((candidate) =>
    titleMatchesIdentity(identity, candidate) &&
    !artistMatchesAny(identity.coverPerformers, candidate.artist) &&
    artistMatchesAny(identity.originalArtists, candidate.artist) &&
    Math.abs(track.durationMs - candidate.durationMs) <= 15_000
  );
  return plausible.sort((left, right) =>
    Math.abs(track.durationMs - left.durationMs) - Math.abs(track.durationMs - right.durationMs)
  )[0];
};
