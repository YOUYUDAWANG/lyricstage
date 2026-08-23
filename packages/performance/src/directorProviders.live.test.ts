import { describe, expect, it } from "vitest";

import {
  directorBibleRequestProfileV1,
  directorBYOKDiagnosticsFromErrorV1,
  executeDirectorBYOKProfileV1,
  scenePackRequestProfileV1,
  type DirectorBYOKConfigurationV1,
  type DirectorProviderExecutionV1,
  type DirectorProviderProtocolV1,
} from "./directorProviders";
import {
  checkpointRollingPerformanceStateV1,
  compileLocalDirectorBibleV1,
  type DirectorBibleV1,
} from "./rollingDirector";
import { realisticLyrics } from "./rollingDirectorRealDataFixture";

const liveKey = process.env.LYRICSTAGE_LIVE_PROVIDER_KEY?.trim() ?? "";
const liveEndpoint = process.env.LYRICSTAGE_LIVE_PROVIDER_ENDPOINT?.trim() || "https://cpa.hachi-mi.uk/v1";
const liveModel = process.env.LYRICSTAGE_LIVE_PROVIDER_MODEL?.trim() || "gemini-3-flash";
const liveProtocol = (process.env.LYRICSTAGE_LIVE_PROVIDER_PROTOCOL?.trim() || "openai-compatible") as DirectorProviderProtocolV1;
const skipLiveBible = process.env.LYRICSTAGE_LIVE_SKIP_BIBLE === "1";

const responseShape = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  try { JSON.parse(trimmed); return "json"; } catch { /* continue */ }
  if (/<(?:!doctype|html|body)\b/iu.test(trimmed)) return "html";
  if (/(?:^|\n)data:/u.test(trimmed)) return "sse";
  if (/(?:^|\n)0:/u.test(trimmed)) return "data-stream";
  return trimmed.endsWith("}") ? "plain-text" : "truncated-text";
};

describe.skipIf(!liveKey)("Director BYOK live provider probe", () => {
  it("generates a Bible and first Scene Pack from real mixed Japanese lyrics", async () => {
    const lyrics = realisticLyrics();
    const configuration: DirectorBYOKConfigurationV1 = {
      version: "lyricstage-director-byok-v1",
      primary: { protocol: liveProtocol, endpoint: liveEndpoint, model: liveModel, apiKey: liveKey },
    };
    const captures: Array<{ status: number; bytes: number; shape: string; output?: unknown }> = [];
    const liveFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      const text = await response.text();
      let output: unknown;
      try {
        const envelope = JSON.parse(text) as {
          choices?: Array<{ message?: { content?: unknown } }>;
          candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
        };
        const content = envelope.choices?.[0]?.message?.content
          ?? envelope.candidates?.[0]?.content?.parts?.flatMap((part) => typeof part.text === "string" ? [part.text] : []).join("");
        const value = typeof content === "string" ? JSON.parse(content) as Record<string, unknown> : content as Record<string, unknown> | undefined;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const wrapped = [value.scenePack, value.pack, value.stageScenes].find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) as Record<string, unknown> | undefined;
          const record = wrapped ?? value;
          const scenes = Array.isArray(record.scenes) ? record.scenes
            : Array.isArray(record.sceneCards) ? record.sceneCards
              : Array.isArray(record.sections) ? record.sections : [];
          output = {
            keys: Object.keys(value), wrappedKeys: wrapped ? Object.keys(wrapped) : [], sceneCount: scenes.length,
            sceneKeys: scenes.slice(0, 3).map((scene) => scene && typeof scene === "object" && !Array.isArray(scene) ? Object.keys(scene) : []),
          };
        }
      } catch {
        // The production parser reports the bounded response shape separately.
      }
      captures.push({ status: response.status, bytes: new TextEncoder().encode(text).length, shape: responseShape(text), ...(output ? { output } : {}) });
      return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    };

    let bibleFailure: unknown;
    let bibleExecution: (DirectorProviderExecutionV1 & { response: DirectorBibleV1 }) | undefined;
    try {
      bibleExecution = skipLiveBible ? undefined : await executeDirectorBYOKProfileV1(
        configuration,
        {
          lyrics,
          promptInput: {
            track: { trackID: "LxcvrBS__UY", title: "純情サクリファイス Parallel ver.", artist: "藍月なくる", durationMs: lyrics.durationMs },
            lines: lyrics.lines,
          },
        },
        directorBibleRequestProfileV1,
        liveFetch,
        45_000,
        3,
      );
    } catch (error) {
      bibleFailure = error;
    }
    if (bibleFailure) {
      console.info("live-provider-bible-failure", JSON.stringify({
        protocol: liveProtocol, model: liveModel, captures,
        attempts: directorBYOKDiagnosticsFromErrorV1(bibleFailure)?.attempts ?? [],
      }, null, 2));
      throw bibleFailure;
    }
    const bible = bibleExecution?.response ?? compileLocalDirectorBibleV1(lyrics);
    const fromLineIndex = lyrics.lines[0]!.lineIndex;
    const firstFromMs = lyrics.lines[0]!.fromMs;
    const toLineIndex = lyrics.lines.filter((line) => line.toMs - firstFromMs <= 60_000).at(-1)!.lineIndex;
    const state = checkpointRollingPerformanceStateV1(lyrics, bible, fromLineIndex)!;
    let sceneFailure: unknown;
    let scene: Awaited<ReturnType<typeof executeDirectorBYOKProfileV1>> | undefined;
    try {
      scene = await executeDirectorBYOKProfileV1(
        configuration,
        {
          lyrics, bible, state,
          promptInput: { bible, state, fromLineIndex, toLineIndex, lines: lyrics.lines },
        },
        scenePackRequestProfileV1,
        liveFetch,
        45_000,
        3,
      );
    } catch (error) {
      sceneFailure = error;
    }
    console.info("live-provider-probe", JSON.stringify({
      protocol: liveProtocol,
      model: liveModel,
      captures,
      bibleAttempts: bibleExecution?.diagnostics.attempts ?? [],
      sceneAttempts: directorBYOKDiagnosticsFromErrorV1(sceneFailure)?.attempts ?? scene?.diagnostics.attempts ?? [],
    }, null, 2));
    if (sceneFailure) throw sceneFailure;
    expect(scene?.response).toBeDefined();
    expect(Array.isArray(scene?.response)).toBe(true);
    expect((scene?.response as unknown[]).length).toBeGreaterThan(0);
  }, 100_000);
});
