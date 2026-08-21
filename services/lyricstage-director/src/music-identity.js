export const musicIdentityRequestVersion = "lyricstage-music-identity-request-v1";
export const musicIdentityResponseVersion = "lyricstage-music-identity-v1";
export const musicIdentityResolverVersion = "gemma4-google-search-v2";

const maximumStringLength = 500;
const maximumNames = 12;

const cleanString = (value, maximum = maximumStringLength) =>
  typeof value === "string" ? value.normalize("NFKC").trim().slice(0, maximum) : "";

const comparable = (value) => cleanString(value)
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s]+/gu, "");

const uniqueStrings = (values, maximum = maximumNames) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    const cleaned = cleanString(value);
    const key = comparable(cleaned);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [cleaned];
  }).slice(0, maximum);
};

const namesOverlap = (left, right) => {
  const leftKey = comparable(left);
  const rightKey = comparable(right);
  return Boolean(leftKey && rightKey && (
    leftKey === rightKey ||
    (leftKey.length >= 3 && rightKey.includes(leftKey)) ||
    (rightKey.length >= 3 && leftKey.includes(rightKey))
  ));
};

export const musicIdentityResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: {
      type: "string",
      enum: ["grounded", "ambiguous", "notFound"],
      description: "grounded only when web evidence supports the song and artist identities",
    },
    canonicalTitle: { type: "string" },
    titleAliases: { type: "array", items: { type: "string" }, maxItems: 8 },
    performers: { type: "array", items: { type: "string" }, maxItems: 8 },
    originalArtists: { type: "array", items: { type: "string" }, maxItems: 8 },
    creators: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          role: {
            type: "string",
            enum: ["lyricist", "composer", "arranger", "producer", "other"],
          },
        },
        required: ["name", "role"],
      },
    },
    isCover: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidenceSummary: {
      type: "string",
      description: "A brief factual summary of what the web sources establish; no hidden reasoning",
    },
  },
  required: [
    "verdict",
    "canonicalTitle",
    "titleAliases",
    "performers",
    "originalArtists",
    "creators",
    "isCover",
    "confidence",
    "evidenceSummary",
  ],
};

export const musicIdentitySystemPrompt = `You resolve music recording identity for a lyrics lookup system.

Use Google Search for every request. Search the exact video title, performer, quoted song title, and likely source artist. Prefer primary evidence: official artist or label pages, official YouTube uploads, Apple Music, Spotify, publisher credits, and recognized music databases.

Distinguish these roles carefully:
- performers: artists performing the supplied recording
- originalArtists: artist(s) of the earliest released or canonical original recording, not merely songwriter, composer, producer, uploader, or a famous later cover
- creators: lyricist, composer, arranger, or producer when sources support those credits

The localHints field contains deterministic guesses and may be wrong. Treat it only as search hints. Do not infer the original artist solely from punctuation, "by", a dash, or filename ordering. Do not return lyrics. Use verdict grounded only when the searched web evidence supports the identity. Otherwise return ambiguous or notFound with empty unsupported fields. Keep evidenceSummary short and factual. Return one JSON object and no markdown.`;

export function sanitizeMusicIdentityRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("request_object_required");
  if (raw.version !== musicIdentityRequestVersion) throw new Error("unsupported_version");
  const trackID = cleanString(raw.trackID, 200);
  const title = cleanString(raw.title);
  const artist = cleanString(raw.artist);
  const durationMs = Number(raw.durationMs);
  if (!trackID || !title || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    throw new Error("invalid_track");
  }
  const hints = raw.localHints && typeof raw.localHints === "object" && !Array.isArray(raw.localHints)
    ? raw.localHints
    : {};
  return {
    version: musicIdentityRequestVersion,
    trackID,
    title,
    artist,
    durationMs: Math.round(durationMs),
    localHints: {
      canonicalTitle: cleanString(hints.canonicalTitle),
      titles: uniqueStrings(hints.titles, 8),
      originalArtists: uniqueStrings(hints.originalArtists, 8),
      coverPerformers: uniqueStrings(hints.coverPerformers, 8),
      isCover: hints.isCover === true,
    },
  };
}

export const buildMusicIdentityPromptInput = (input) => ({
  task: "identify_music_recording_and_original_artist",
  track: {
    trackID: input.trackID,
    title: input.title,
    artist: input.artist,
    durationMs: input.durationMs,
  },
  localHints: input.localHints,
  acceptance: {
    requireWebSearch: true,
    requireOriginalArtistForCover: true,
    rejectRoleConfusion: true,
  },
});

const groundedSources = (groundingMetadata) => {
  const chunks = Array.isArray(groundingMetadata?.groundingChunks)
    ? groundingMetadata.groundingChunks
    : [];
  const seen = new Set();
  const chunkSources = chunks.flatMap((chunk) => {
    const uri = cleanString(chunk?.web?.uri, 2_000);
    const title = cleanString(chunk?.web?.title);
    if (!uri || seen.has(uri)) return [];
    try {
      if (new URL(uri).protocol !== "https:") return [];
    } catch {
      return [];
    }
    seen.add(uri);
    return [{ uri, title, domain: (() => {
      try { return new URL(uri).hostname.slice(0, 200); } catch { return ""; }
    })() }];
  }).slice(0, 8);
  if (chunkSources.length > 0) return chunkSources;

  const renderedContent = cleanString(groundingMetadata?.searchEntryPoint?.renderedContent, 40_000);
  const chipPattern = /<a\s+class="chip"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu;
  const searchSources = [];
  for (const match of renderedContent.matchAll(chipPattern)) {
    const uri = match[1].replaceAll("&amp;", "&");
    const title = match[2]
      .replace(/<[^>]+>/gu, "")
      .replaceAll("&quot;", "\"")
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&")
      .trim();
    try {
      const url = new URL(uri);
      if (url.protocol !== "https:" || seen.has(uri)) continue;
      seen.add(uri);
      searchSources.push({ uri, title: title ? `Google Search: ${title}` : "Google Search", domain: url.hostname.slice(0, 200) });
    } catch {
      continue;
    }
    if (searchSources.length >= 8) break;
  }
  return searchSources;
};

const unavailableIdentity = (input, reason = "insufficient_grounding") => ({
  version: musicIdentityResponseVersion,
  resolverVersion: musicIdentityResolverVersion,
  trackID: input.trackID,
  status: "ambiguous",
  canonicalTitle: "",
  titleAliases: [],
  performers: [],
  originalArtists: [],
  creators: [],
  isCover: input.localHints.isCover,
  confidence: 0,
  evidenceSummary: "",
  searchQueries: [],
  sources: [],
  reason,
});

export function finalizeMusicIdentityResponse(input, raw, groundingMetadata) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return unavailableIdentity(input, "invalid_model_output");
  const sources = groundedSources(groundingMetadata);
  const canonicalTitle = cleanString(raw.canonicalTitle);
  const titleAliases = uniqueStrings(raw.titleAliases, 8);
  const performers = uniqueStrings(raw.performers, 8);
  const originalArtists = uniqueStrings(raw.originalArtists, 8)
    .filter((original) => !performers.some((performer) => namesOverlap(original, performer)));
  const creators = (Array.isArray(raw.creators) ? raw.creators : []).flatMap((creator) => {
    const name = cleanString(creator?.name);
    const role = cleanString(creator?.role, 30);
    if (!name || !["lyricist", "composer", "arranger", "producer", "other"].includes(role)) return [];
    return [{ name, role }];
  }).slice(0, 12);
  const isCover = raw.isCover === true;
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const performerAgreesWithInput = !input.artist || performers.some((performer) => namesOverlap(performer, input.artist));
  const grounded = raw.verdict === "grounded" &&
    confidence >= 0.65 &&
    Boolean(canonicalTitle) &&
    performerAgreesWithInput &&
    sources.length > 0 &&
    (!isCover || originalArtists.length > 0);
  const searchQueries = uniqueStrings(groundingMetadata?.webSearchQueries, 8);
  if (!grounded) {
    return {
      ...unavailableIdentity(input, sources.length === 0 ? "no_web_grounding" : "identity_not_proven"),
      status: raw.verdict === "notFound" ? "notFound" : "ambiguous",
      searchQueries,
      sources,
    };
  }
  return {
    version: musicIdentityResponseVersion,
    resolverVersion: musicIdentityResolverVersion,
    trackID: input.trackID,
    status: "grounded",
    canonicalTitle,
    titleAliases: uniqueStrings([canonicalTitle, ...titleAliases], 8),
    performers,
    originalArtists,
    creators,
    isCover,
    confidence,
    evidenceSummary: cleanString(raw.evidenceSummary, 800),
    searchQueries,
    sources,
  };
}
