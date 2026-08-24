import {
  aiLyricsLookupAssistVersion,
  sanitizeAILyricsLookupAssistResultV1,
  type AILyricsLookupAssistRequestV1,
  type AILyricsLookupAssistResultV1,
} from "@lyricstage/lyrics";
import type { DirectorRequestProfileV1 } from "@lyricstage/performance";

export const aiLyricsLookupAssistSystemPromptV1 = `You resolve one music identity and, only when justified, select one synchronized lyric candidate already supplied by the client.

Return structured metadata only. Remove upload packaging such as official video, MV, lyrics, cover, live, remix, brackets, labels and channel wording from canonicalTitle. Keep meaningful punctuation in the actual song title. Distinguish the performer of this recording from the original artist. For covers, isCover must be true and recordingArtists must describe the supplied recording. A differently credited candidate with the same title and compatible duration may support originalArtists even when the recording already has a good lyrics match; preferredCandidate may remain null in that case. Only include an original artist when supported; otherwise leave originalArtists empty and preferredCandidate null so the client asks the user. Never invent a candidate or request another search: preferredCandidate may only copy one provider/id pair from candidates, and must be null when none is sufficiently supported. Use duration, title aliases and artist roles together. If the title itself is uncertain, use confidence below 0.72 so the client rejects the result. Do not return lyrics, translations, timestamps, markdown, explanations, sources or code.`;

export const aiLyricsLookupAssistSchemaV1: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: [aiLyricsLookupAssistVersion] },
    trackID: { type: "string" },
    canonicalTitle: { type: "string" },
    titleAliases: { type: "array", items: { type: "string" }, maxItems: 8 },
    recordingArtists: { type: "array", items: { type: "string" }, maxItems: 8 },
    originalArtists: { type: "array", items: { type: "string" }, maxItems: 8 },
    isCover: { type: "boolean" },
    preferredCandidate: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          properties: { provider: { type: "string" }, id: { type: "string" } },
          required: ["provider", "id"],
        },
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "version", "trackID", "canonicalTitle", "titleAliases", "recordingArtists",
    "originalArtists", "isCover", "preferredCandidate", "confidence",
  ],
};

export const aiLyricsLookupAssistProfileV1: DirectorRequestProfileV1<AILyricsLookupAssistResultV1> = {
  version: "director-request-profile-v1",
  kind: "legacy",
  schemaName: "lyricstage_lyrics_lookup_assist",
  systemPrompt: aiLyricsLookupAssistSystemPromptV1,
  schema: aiLyricsLookupAssistSchemaV1,
  compactInput(requestValue) {
    const request = requestValue as AILyricsLookupAssistRequestV1;
    return {
      task: "resolve_identity_and_select_existing_lyrics_candidate",
      version: request.version,
      track: request.track,
      localHints: request.localIdentity,
      candidates: request.candidates,
    };
  },
  adapt(requestValue, aiValue) {
    const result = sanitizeAILyricsLookupAssistResultV1(
      requestValue as AILyricsLookupAssistRequestV1,
      aiValue,
    );
    return result ? { response: result } : { reason: "lyrics-assist-contract-invalid" };
  },
};
