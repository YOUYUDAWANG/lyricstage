import { useEffect, useMemo, useRef, useState } from "react";
import { lyricFixtures, type LyricDocumentV0 } from "@lyricstage/contracts";
import {
  compileEnvironmentSceneV1,
  defaultEnvironmentTuningV1,
  motionClipsV1,
  sampleMotionClipV1,
  TimedTextIndexV1,
  type EnvironmentSceneV1,
  type EnvironmentTuningV1,
  type MotionClipV1,
  type TimedTextUnitV1,
} from "@lyricstage/performance";
import { GpuEnvironment, type GpuRendererStatus } from "./GpuEnvironment";
import type { TheatreAuthoringHandle } from "./theatreAuthoring";
import { rollingArrivalFixturesV1 } from "./rollingArrivalFixtures";

const fixtures = {
  "逐字混排": lyricFixtures.wordTimedMixed,
  "日文逐行": lyricFixtures.lineOnlyJA,
  "中英日长句": lyricFixtures.longLine,
  "重复副歌": lyricFixtures.repeatedHook,
  "重叠二重唱": lyricFixtures.duetOverlap,
  "长结构歌曲": lyricFixtures.longSongStructure,
} satisfies Record<string, LyricDocumentV0>;

const formatTime = (timeMs: number): string => {
  const seconds = Math.max(0, timeMs) / 1000;
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}.${Math.floor((seconds % 1) * 10)}`;
};

const unitLabel = (units: TimedTextUnitV1[]): string =>
  units.length > 0 ? units.map((unit) => unit.text).join(" / ") : "—";

function LabStage({
  lyrics,
  timeMs,
  clip,
  environment,
  tuning,
  structureEnergy,
  onRendererStatus,
}: {
  lyrics: LyricDocumentV0;
  timeMs: number;
  clip: MotionClipV1;
  environment: EnvironmentSceneV1;
  tuning: EnvironmentTuningV1;
  structureEnergy: number;
  onRendererStatus: (status: GpuRendererStatus) => void;
}) {
  const index = useMemo(() => new TimedTextIndexV1(lyrics), [lyrics]);
  const active = index.phrasesAt(timeMs);
  const primary = active[0];
  const secondary = active[1];
  const localTime = primary ? Math.max(0, timeMs - primary.fromMs) : 0;
  const motion = sampleMotionClipV1(clip, localTime);
  const primaryStyle = {
    opacity: motion.opacity ?? 1,
    transform: `translate3d(${motion.translateX ?? 0}px, ${motion.translateY ?? 0}px, 0) scale(${motion.scale ?? 1}) rotate(${motion.rotation ?? 0}deg)`,
    filter: `blur(${motion.blur ?? 0}px)`,
    letterSpacing: `${motion.tracking ?? -0.018}em`,
    clipPath: motion.maskProgress === undefined
      ? undefined
      : `inset(0 ${(1 - motion.maskProgress) * 100}% 0 0)`,
  };
  const previous = primary ? lyrics.lines[primary.lineIndex - 1] : undefined;
  const next = primary ? lyrics.lines[primary.lineIndex + active.length] : lyrics.lines[0];

  return (
    <section className="lab-stage" aria-label="演出预览" data-fixture={lyrics.recordingID}>
      <GpuEnvironment
        scene={environment}
        timeMs={timeMs}
        tuning={tuning}
        structureEnergy={structureEnergy}
        onRendererStatus={onRendererStatus}
      />
      <div className="lab-stage-grid" aria-hidden="true" />
      <div className="lab-stage-index">LS / PERFORMANCE LAB / {clip.id}</div>
      {previous && <div className="lab-memory lab-memory-previous">{previous.text}</div>}
      <div className={`lab-primary ${secondary ? "is-duet" : ""}`} style={primaryStyle}>
        {primary?.text ?? "等待下一句歌词"}
      </div>
      {secondary && <div className="lab-secondary">{secondary.text}</div>}
      {next && <div className="lab-memory lab-memory-next">{next.text}</div>}
      <div className="lab-stage-time">{formatTime(timeMs)}</div>
    </section>
  );
}

export default function App() {
  const [fixtureName, setFixtureName] = useState<keyof typeof fixtures>("逐字混排");
  const [clipID, setClipID] = useState(motionClipsV1[0]!.id);
  const [rollingFixtureID, setRollingFixtureID] = useState(rollingArrivalFixturesV1[0]!.id);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<GpuRendererStatus>("loading");
  const [authoringStatus, setAuthoringStatus] = useState<"loading" | "ready" | "unavailable">(
    import.meta.env.DEV ? "loading" : "unavailable",
  );
  const [authoringError, setAuthoringError] = useState<string | null>(null);
  const [studioVisible, setStudioVisible] = useState(false);
  const [environmentTuning, setEnvironmentTuning] = useState<EnvironmentTuningV1>(defaultEnvironmentTuningV1);
  const anchorRef = useRef({ wallMs: 0, mediaMs: 0 });
  const authoringRef = useRef<TheatreAuthoringHandle | null>(null);
  const lyrics = fixtures[fixtureName];
  const clip = motionClipsV1.find((candidate) => candidate.id === clipID) ?? motionClipsV1[0]!;
  const index = useMemo(() => new TimedTextIndexV1(lyrics), [lyrics]);
  const environment = useMemo(() => compileEnvironmentSceneV1(lyrics.recordingID), [lyrics.recordingID]);
  const phrases = index.phrasesAt(timeMs);
  const words = index.wordsAt(timeMs);
  const characters = index.charactersAt(timeMs);
  const activeLine = phrases[0];
  const repeatedCount = activeLine
    ? lyrics.lines.filter((line) => line.text === activeLine.text).length
    : 0;
  const structureEnergy = activeLine
    ? repeatedCount > 1
      ? 1
      : 0.48 + (activeLine.lineIndex % 4) * 0.09
    : 0.2;
  const rollingFixture = rollingArrivalFixturesV1.find((fixture) => fixture.id === rollingFixtureID)!;
  const rollingFixtureState = timeMs < rollingFixture.arrivalMs
    ? "local"
    : rollingFixture.arrivalMs > rollingFixture.intendedBoundaryMs
      ? "late-local"
      : "scene-ready";

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let cancelled = false;
    void import("./theatreAuthoring")
      .then(({ connectTheatreAuthoring }) => connectTheatreAuthoring(setEnvironmentTuning))
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        authoringRef.current = handle;
        setAuthoringStatus("ready");
        setStudioVisible(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuthoringStatus("unavailable");
          setAuthoringError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
      authoringRef.current?.dispose();
      authoringRef.current = null;
    };
  }, []);

  useEffect(() => {
    authoringRef.current?.setPosition(timeMs);
  }, [timeMs]);

  useEffect(() => {
    if (!playing) return undefined;
    anchorRef.current = { wallMs: performance.now(), mediaMs: timeMs };
    let frameID = 0;
    const tick = (wallMs: number) => {
      const next = anchorRef.current.mediaMs + wallMs - anchorRef.current.wallMs;
      if (next >= lyrics.durationMs) {
        setTimeMs(lyrics.durationMs);
        setPlaying(false);
        return;
      }
      setTimeMs(next);
      frameID = requestAnimationFrame(tick);
    };
    frameID = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameID);
  }, [lyrics.durationMs, playing]);

  const selectFixture = (name: keyof typeof fixtures) => {
    setPlaying(false);
    setFixtureName(name);
    setTimeMs(0);
  };

  return (
    <main className="lab-shell" data-rolling-fixture={rollingFixture.id} data-rolling-state={rollingFixtureState}>
      <header className="lab-header">
        <div>
          <p>LYRICSTAGE / 01</p>
          <h1>Performance Lab</h1>
        </div>
        <span>fixture-only · no YTM · no AI · GPU {gpuStatus}</span>
      </header>

      <div className="lab-workspace">
        <aside className="lab-panel lab-controls">
          <label>
            Fixture
            <select value={fixtureName} onChange={(event) => selectFixture(event.target.value as keyof typeof fixtures)}>
              {Object.keys(fixtures).map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Motion clip
            <select value={clipID} onChange={(event) => setClipID(event.target.value)}>
              {motionClipsV1.map((candidate) => <option key={candidate.id}>{candidate.id}</option>)}
            </select>
          </label>
          <label>
            Rolling arrival
            <select value={rollingFixtureID} onChange={(event) => setRollingFixtureID(event.target.value as typeof rollingFixtureID)}>
              {rollingArrivalFixturesV1.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.label}</option>)}
            </select>
          </label>
          <div className="lab-facts">
            <span>duration</span><strong>{formatTime(lyrics.durationMs)}</strong>
            <span>phrases</span><strong>{index.phrases.length}</strong>
            <span>words</span><strong>{index.words.length || "line-only"}</strong>
            <span>characters</span><strong>{index.characters.length || "not invented"}</strong>
            <span>scene seed</span><strong>{environment.seed}</strong>
            <span>authoring</span><strong>{authoringStatus}</strong>
            <span>rolling</span><strong>{rollingFixtureState}</strong>
          </div>
          {authoringError && <p className="lab-authoring-error">{authoringError}</p>}
          {authoringStatus === "ready" && (
            <div className="lab-authoring-actions">
              <button className="lab-export" type="button" onClick={() => authoringRef.current?.exportState()}>
                Export Theatre state
              </button>
              <button
                className="lab-export"
                type="button"
                onClick={() => setStudioVisible(authoringRef.current?.toggleStudio() ?? false)}
              >
                {studioVisible ? "Hide Theatre UI" : "Show Theatre UI"}
              </button>
            </div>
          )}
        </aside>

        <div className="lab-preview-column">
          <LabStage
            lyrics={lyrics}
            timeMs={timeMs}
            clip={clip}
            environment={environment}
            tuning={environmentTuning}
            structureEnergy={structureEnergy}
            onRendererStatus={setGpuStatus}
          />
          <div className="lab-transport">
            <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={() => { setPlaying(false); setTimeMs(0); }}>Reset</button>
            <button type="button" onClick={() => { setPlaying(false); setTimeMs((value) => Math.max(0, value - 1000 / 60)); }}>−1f</button>
            <button type="button" onClick={() => { setPlaying(false); setTimeMs((value) => Math.min(lyrics.durationMs, value + 1000 / 60)); }}>+1f</button>
            <input
              aria-label="演出时间"
              type="range"
              min={0}
              max={lyrics.durationMs}
              step={10}
              value={Math.min(lyrics.durationMs, timeMs)}
              onChange={(event) => {
                setPlaying(false);
                setTimeMs(Number(event.target.value));
              }}
            />
            <input
              className="lab-time-input"
              aria-label="精确时间（毫秒）"
              type="number"
              min={0}
              max={lyrics.durationMs}
              step={10}
              value={Math.round(timeMs)}
              onChange={(event) => {
                setPlaying(false);
                setTimeMs(Math.min(lyrics.durationMs, Math.max(0, Number(event.target.value))));
              }}
            />
            <output>{formatTime(timeMs)}</output>
          </div>
        </div>

        <aside className="lab-panel lab-inspector">
          <h2>TimedTextIndex</h2>
          <dl>
            <dt>Phrase</dt><dd>{unitLabel(phrases)}</dd>
            <dt>Word</dt><dd>{unitLabel(words)}</dd>
            <dt>Characters</dt><dd>{unitLabel(characters)}</dd>
          </dl>
          <h2>Motion sample</h2>
          <pre>{JSON.stringify(sampleMotionClipV1(clip, Math.max(0, timeMs - (phrases[0]?.fromMs ?? timeMs))), null, 2)}</pre>
          <h2>GPU environment</h2>
          <pre>{JSON.stringify({
            version: environment.version,
            seed: environment.seed,
            palette: environment.palette,
            particles: environment.particles.length,
            rails: environment.rails.length,
            orbs: environment.orbs.length,
            structureEnergy,
            tuning: environmentTuning,
          }, null, 2)}</pre>
        </aside>
      </div>
    </main>
  );
}
