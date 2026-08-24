import type { LyricsCandidateV0, LyricsLookupTrackV0, LyricsSearchIdentityV0 } from "./types";

export interface LyricsLookupIdentityV0 {
  canonicalTitle: string;
  titles: string[];
  originalArtists: string[];
  coverPerformers: string[];
  isCover: boolean;
}

const packaging = /(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|lyrics?|歌ってみた|歌ってみました|歌いました|歌唱|弾き語り|カバー|翻唱|唱见|cover(?:ed)?|live|acoustic|arrange(?:d)?|remix(?:ed)?|game\s*version|mv|pv|4k|字幕|中字|完整版|full\s*(?:version|ver\.?)|remaster(?:ed)?)/iu;
const coverMarker = /(?:歌ってみた|歌ってみました|歌いました|弾き語り|カバー|翻唱|唱见|\bcover(?:ed)?\b)/iu;
const topicSuffix = /(?:\s*[-–—]\s*topic)$/iu;
const featureMarker = /\b(?:feat(?:uring)?|ft)\.?\s*[:：]?\s*/iu;

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

const leadingSeparators = /^[\-–—|:：\/\s]+/gu;
const trailingSeparators = /[|:：\/\s]+$/gu;
const roleSeparator = /\s*(?:\/|\|)\s*/gu;
const spacedDash = /\s+[-–—]\s+/gu;

const normalizeTitle = (title: string): string =>
  title.normalize("NFKC").replace(topicSuffix, "").trim();

const trimBoundaries = (value: string): string => value
  .replace(/\s{2,}/gu, " ")
  .trim()
  .replace(leadingSeparators, "")
  .replace(trailingSeparators, "")
  .trim();

const stripPackaging = (title: string): string => {
  let value = normalizeTitle(title)
    .replace(/\s*[|]\s*from\s+[^|]+$/iu, "")
    .replace(/\s*[([]\s*\d{4}\s*[)\]]\s*$/u, "");
  value = value.replace(/[\[(【〖〘〚][^\])】〗〙〛]*[\])】〗〙〛]/gu, (group) =>
    packaging.test(group) ? " " : group
  );
  value = value.replace(
    /(?:\s*[-–—|:：\/]\s*)?(?:(?:acoustic|piano)\s+)?(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|lyrics?|歌ってみた|翻唱|cover(?:ed)?|mv|pv|4k|字幕|中字|full\s*version|remaster(?:ed)?)[\s.。]*$/iu,
    "",
  );
  return trimBoundaries(value);
};

const artistNames = (artist: string): string[] => {
  const cleaned = artist.normalize("NFKC").replace(topicSuffix, "").trim();
  const split = cleaned.split(/\s*(?:\/|／|、|,|，|·|・| feat\.? | featuring )\s*/iu);
  return unique(split.length > 1 ? [...split, cleaned] : [cleaned]);
};

const artistsMatch = (left: string, right: string): boolean => {
  const a = comparableLyricsText(left);
  const b = comparableLyricsText(right);
  return a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b));
};

const splitFeaturing = (value: string): { title: string; artists: string[] } => {
  const parenthetical = value.match(/^(.*?)[(]\s*(?:feat(?:uring)?|ft)\.?\s*[:：]?\s*([^()]{1,160})[)]\s*$/iu);
  const inline = parenthetical ?? value.match(/^(.*?)\s+\b(?:feat(?:uring)?|ft)\.?\s*[:：]?\s*(.{1,160})$/iu);
  if (!inline?.[1] || !inline[2]) return { title: trimBoundaries(value), artists: [] };
  return {
    title: trimBoundaries(inline[1]),
    artists: artistNames(inline[2]),
  };
};

const extractExplicitPerformer = (
  value: string,
  isCover: boolean,
): { value: string; performers: string[] } => {
  const patterns = [
    /(?:\s*[-–—|:：\/]\s*)?(?:cover(?:ed)?|sung)\s+by\s+(.+?)\s*$/iu,
    /(?:\s*[-–—|:：\/]\s*)?cover\s*[:：]\s*(.+?)\s*$/iu,
    /(?:\s*[-–—|:：\/]\s*)?cover\s+(.+?)\s*$/iu,
    ...(isCover ? [
      /(?:\s*[-–—|:：\/]\s*)?(?:歌(?:唱)?|vocal|vo\.?)\s*[:：]\s*(.+?)\s*$/iu,
      /(?:\s*[-–—|:：\/]\s*)?\bby\s+(.+?)\s*$/iu,
    ] : []),
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const credit = match?.[1]?.trim();
    if (!match || match.index === undefined || !credit || packaging.test(credit)) continue;
    return {
      value: trimBoundaries(value.slice(0, match.index)),
      performers: artistNames(credit),
    };
  }
  return { value, performers: [] };
};

const extractKnownPerformerSuffix = (
  value: string,
  knownPerformers: string[],
): { value: string; performers: string[] } => {
  const separators = [
    ...value.matchAll(roleSeparator),
    ...value.matchAll(spacedDash),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const separator = separators.at(-1);
  if (!separator || separator.index === undefined) return { value, performers: [] };
  const suffix = trimBoundaries(value.slice(separator.index + separator[0].length));
  if (!suffix || !knownPerformers.some((known) => artistsMatch(known, suffix))) {
    return { value, performers: [] };
  }
  return {
    value: trimBoundaries(value.slice(0, separator.index)),
    performers: artistNames(suffix),
  };
};

const extractTrailingOriginal = (
  value: string,
  isCover: boolean,
): { value: string; originals: string[] } => {
  if (!isCover) return { value, originals: [] };
  const match = value.match(/^(.*?)[(]([^()]{1,80})[)]\s*$/u);
  const credit = match?.[2]?.trim();
  if (!match?.[1] || !credit || packaging.test(credit) || featureMarker.test(credit) || /^cv\s*[:：]/iu.test(credit)) {
    return { value, originals: [] };
  }
  return { value: trimBoundaries(match[1]), originals: artistNames(credit) };
};

interface ParsedTitleRoles {
  title: string;
  originalArtists: string[];
  coverPerformers: string[];
  hasEmbeddedOriginal: boolean;
}

const parseTitleRoles = (
  rawTitle: string,
  trackPerformers: string[],
  isCover: boolean,
): ParsedTitleRoles => {
  const withoutSource = normalizeTitle(rawTitle)
    .replace(/\s*[|]\s*from\s+[^|]+$/iu, "")
    .replace(/\s*[([]\s*\d{4}\s*[)\]]\s*$/u, "");
  if (!isCover) {
    const versionSeparatedArtists = withoutSource.match(
      /^(.*?)[(]\s*(?:full\s*(?:version|ver\.?)|game\s*version)\s*[)]\s+(.+?)\s*$/iu,
    );
    if (versionSeparatedArtists?.[1] && versionSeparatedArtists[2]) {
      const creditedArtists = stripPackaging(versionSeparatedArtists[2]);
      if (creditedArtists) {
        return {
          title: stripPackaging(versionSeparatedArtists[1]),
          originalArtists: artistNames(creditedArtists),
          coverPerformers: [],
          hasEmbeddedOriginal: true,
        };
      }
    }
  }
  const explicitPerformer = extractExplicitPerformer(withoutSource, isCover);
  let value = stripPackaging(explicitPerformer.value);
  const suffixPerformer = isCover
    ? extractKnownPerformerSuffix(value, unique([...explicitPerformer.performers, ...trackPerformers]))
    : { value, performers: [] };
  value = suffixPerformer.value;
  const trailingOriginal = extractTrailingOriginal(value, isCover);
  value = trailingOriginal.value;
  const coverPerformers = unique([
    ...explicitPerformer.performers,
    ...suffixPerformer.performers,
    ...(explicitPerformer.performers.length === 0 && suffixPerformer.performers.length === 0 ? trackPerformers : []),
  ]);
  const originals = [...trailingOriginal.originals];
  let hasEmbeddedOriginal = originals.length > 0;

  if (!isCover) {
    const vocal = value.match(/^(.*?)\s*[\/|]\s*歌(?:唱)?\s*[:：]\s*([^()]+?)(?:\s*[(]\s*cv\s*[:：]\s*(.+?)\s*[)])?\s*$/iu);
    if (vocal?.[1] && vocal[2]) {
      return {
        title: trimBoundaries(vocal[1]),
        originalArtists: unique([...artistNames(vocal[2]), ...(vocal[3] ? artistNames(vocal[3]) : [])]),
        coverPerformers: [],
        hasEmbeddedOriginal: true,
      };
    }
  }

  const dashes = [...value.matchAll(spacedDash)];
  const dash = dashes[0];
  if (dash?.index !== undefined) {
    const left = trimBoundaries(value.slice(0, dash.index));
    const right = trimBoundaries(value.slice(dash.index + dash[0].length));
    if (left && right) {
      if ((!isCover && trackPerformers.some((artist) => artistsMatch(artist, left))) || featureMarker.test(right)) {
        const featured = splitFeaturing(right);
        value = featured.title;
        originals.push(...artistNames(left), ...featured.artists);
        hasEmbeddedOriginal = true;
      } else if (isCover) {
        value = left;
        originals.push(...artistNames(right));
        hasEmbeddedOriginal = true;
      }
    }
  } else if (isCover) {
    const separators = [...value.matchAll(roleSeparator)];
    const separator = separators.at(-1);
    if (separator?.index !== undefined) {
      const left = trimBoundaries(value.slice(0, separator.index));
      const right = trimBoundaries(value.slice(separator.index + separator[0].length));
      if (left && right) {
        value = left;
        originals.push(...artistNames(right));
        hasEmbeddedOriginal = true;
      }
    }
  }

  const featured = splitFeaturing(value);
  return {
    title: featured.title,
    originalArtists: unique([...originals, ...featured.artists]),
    coverPerformers,
    hasEmbeddedOriginal,
  };
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
  const roles = parseTitleRoles(rawTitle, performers, isCover);
  const cleaned = stripPackaging(rawTitle);
  const titles = unique([
    ...quoted,
    roles.title,
    ...(roles.title === cleaned ? [] : [cleaned]),
    rawTitle.replace(topicSuffix, "").trim(),
  ]);
  const originals = unique([
    ...explicitOriginalArtists(rawTitle),
    ...roles.originalArtists,
    ...(!isCover && !roles.hasEmbeddedOriginal ? performers : []),
  ]);
  return {
    canonicalTitle: titles[0] ?? rawTitle,
    titles,
    originalArtists: originals,
    coverPerformers: isCover ? roles.coverPerformers : [],
    isCover,
  };
};

export const publicLyricsSearchIdentity = (
  track: LyricsLookupTrackV0,
  identity: LyricsLookupIdentityV0,
  method: LyricsSearchIdentityV0["method"] = "local",
  confidence = 0.8,
): LyricsSearchIdentityV0 => ({
  canonicalTitle: identity.canonicalTitle,
  recordingArtists: identity.isCover
    ? unique(identity.coverPerformers.length > 0 ? identity.coverPerformers : [track.artist])
    : unique(identity.originalArtists.length > 0 ? identity.originalArtists : [track.artist]),
  originalArtists: identity.originalArtists,
  isCover: identity.isCover,
  method,
  confidence: Math.max(0, Math.min(1, confidence)),
});

export const titleMatchesIdentity = (
  identity: LyricsLookupIdentityV0,
  candidate: LyricsCandidateV0,
): boolean => {
  const candidateIdentity = buildLyricsLookupIdentity({
    provider: "youtubeMusic",
    trackID: `candidate:${candidate.provider}:${candidate.id}`,
    title: candidate.title,
    artist: candidate.artist,
    durationMs: candidate.durationMs,
  });
  const actualTitles = new Set(candidateIdentity.titles.map(comparableLyricsText));
  return identity.titles.some((title) => actualTitles.has(comparableLyricsText(title)));
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
