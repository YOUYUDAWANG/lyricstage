import {
  buildAILyricsLookupAssistRequestV1,
  isSafeIdentityMatch,
  mergeAILyricsLookupAssistIdentityV1,
  preferredOriginalFallbackCandidate,
  publicLyricsSearchIdentity,
  type LyricsLookupIdentityV0,
  type LyricsLookupResponseV0,
  type LyricsLookupTrackV0,
} from "@lyricstage/lyrics";
import {
  executeDirectorBYOKProfileV1,
  type DirectorBYOKConfigurationV1,
} from "@lyricstage/performance";
import { aiLyricsLookupAssistProfileV1 } from "./lyricsLookupAssist";

interface AutomaticLyricsAssistInput {
  track: LyricsLookupTrackV0;
  identity: LyricsLookupIdentityV0;
  initial: LyricsLookupResponseV0;
  configuration?: DirectorBYOKConfigurationV1;
  fetchImplementation?: typeof fetch;
}

export const assistAutomaticLyrics = async ({
  track,
  identity,
  initial,
  configuration,
  fetchImplementation = fetch,
}: AutomaticLyricsAssistInput): Promise<{
  result: LyricsLookupResponseV0;
  assistance?: LyricsLookupResponseV0["assistance"];
}> => {
  if (initial.status === "match" || !configuration) return { result: initial };
  try {
    const request = buildAILyricsLookupAssistRequestV1(track, identity, initial.candidates);
    const execution = await executeDirectorBYOKProfileV1(
      configuration, request, aiLyricsLookupAssistProfileV1, fetchImplementation, 12_000, 1,
    );
    const assistedIdentity = mergeAILyricsLookupAssistIdentityV1(track, identity, execution.response);
    let result: LyricsLookupResponseV0 = {
      ...initial,
      resolvedIdentity: publicLyricsSearchIdentity(
        track,
        assistedIdentity,
        "ai",
        execution.response.confidence,
      ),
    };
    const requested = execution.response.preferredCandidate;
    if (requested && execution.response.confidence >= 0.82) {
      const preferred = initial.candidates.find((candidate) =>
        candidate.provider === requested.provider && candidate.id === requested.id);
      const original = preferredOriginalFallbackCandidate(track, assistedIdentity, preferred ? [preferred] : []);
      if (preferred && (isSafeIdentityMatch(track, assistedIdentity, preferred) || original === preferred)) {
        result = {
          ...result,
          status: "match",
          match: preferred,
          matchKind: original ? "originalFallback" : "sameRecording",
          candidates: [preferred, ...initial.candidates.filter((candidate) =>
            candidate.provider !== preferred.provider || candidate.id !== preferred.id)].slice(0, 5),
        };
      }
    }
    return { result, assistance: "ai" };
  } catch {
    return { result: initial, assistance: "aiUnavailable" };
  }
};
