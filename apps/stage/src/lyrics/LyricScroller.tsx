import {
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import {
  alignTimedLineSegments,
  wordProgressFromTiming,
  type TimedLineSegment,
} from "../column/timedLineText";
import { formatClock, mapVoiceClass } from "../column/columnModel";
import { playbackTimeForLyricsMs } from "../playback/lyricsTimeOffset";
import {
  activeLyricKey,
  activeLyricLineIndices,
  lyricLineTabIndex,
  lyricScrollDurationMs,
  lyricScrollProgress,
  nextLyricFollowMode,
  nextLyricStartIntervalMs,
  type LyricFollowMode,
} from "./lyricFollowModel";
import {
  graphemeWipeProgress,
  segmentDisplayGraphemes,
  youlyLineVisualClass,
  youlyWordGrowthScale,
} from "./youlyVisualModel";

export interface LyricScrollerProps {
  lyrics: LyricDocumentV0;
  lyricTimeMs: number;
  lyricsOffsetMs: number;
  durationMs: number;
  density: "column" | "fullscreen";
  reduceMotion: boolean;
  followSuspended?: boolean;
  onSeek: (playbackTimeMs: number) => void | Promise<void>;
}

const userBrowseKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

type TimedWordSegment = Extract<TimedLineSegment, { kind: "word" }>;

const YouLyTimedWord = memo(function YouLyTimedWord({
  segment,
  sampleTimeMs,
  phase,
  reduceMotion,
}: {
  segment: TimedWordSegment;
  sampleTimeMs: number;
  phase: "past" | "active" | "future";
  reduceMotion: boolean;
}) {
  const graphemes = useMemo(() => segmentDisplayGraphemes(segment.text), [segment.text]);
  const progress = phase === "active"
    ? wordProgressFromTiming(sampleTimeMs, segment.fromMs, segment.toMs)
    : phase === "past" ? 1 : 0;
  const scale = youlyWordGrowthScale(
    progress,
    graphemes.length,
    segment.toMs - segment.fromMs,
    reduceMotion,
  );
  return (
    <span
      className="lyric-scroller-word lyric-scroller-word-wrap"
      data-has-timing="true"
      data-timing-kind={segment.timingKind}
      data-growable={scale !== 1 || undefined}
      style={{
        "--word-progress": `${progress * 100}%`,
        "--youly-word-scale": String(scale),
      } as CSSProperties}
    >
      {graphemes.map((grapheme, index) => (
        <span
          key={`${index}:${grapheme}`}
          className="lyric-scroller-char"
          style={{ "--char-progress": `${graphemeWipeProgress(progress, index, graphemes.length) * 100}%` } as CSSProperties}
        >
          {grapheme}
        </span>
      ))}
    </span>
  );
});

export function LyricScroller({
  lyrics,
  lyricTimeMs,
  lyricsOffsetMs,
  durationMs,
  density,
  reduceMotion,
  followSuspended = false,
  onSeek,
}: LyricScrollerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineElementsRef = useRef(new Map<number, HTMLButtonElement>());
  const animationFrameRef = useRef<number | null>(null);
  const lastActiveKeyRef = useRef("");
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const followSuspendedRef = useRef(followSuspended);
  const followModeRef = useRef<LyricFollowMode>("following");
  const pendingSeekLineRef = useRef<number | null>(null);
  const [followMode, setFollowMode] = useState<LyricFollowMode>("following");
  const [seekFailed, setSeekFailed] = useState(false);

  const setMode = useCallback((mode: LyricFollowMode) => {
    followModeRef.current = mode;
    setFollowMode(mode);
  }, []);

  const cancelAutomaticScroll = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const activeIndices = useMemo(
    () => activeLyricLineIndices(lyrics.lines, lyricTimeMs),
    [lyricTimeMs, lyrics.lines],
  );
  const activeSet = useMemo(() => new Set(activeIndices), [activeIndices]);
  const activeKey = useMemo(() => activeLyricKey(activeIndices), [activeIndices]);
  const lineSegments = useMemo(
    () => new Map(lyrics.lines.map((line) => [line.lineIndex, alignTimedLineSegments(line)])),
    [lyrics.lines],
  );
  const nextIntervalMs = useMemo(
    () => nextLyricStartIntervalMs(lyrics.lines, activeSet),
    [activeSet, lyrics.lines],
  );

  const animateToIndices = useCallback((indices: readonly number[], completeReturn: boolean) => {
    const viewport = viewportRef.current;
    const elements = indices
      .map((lineIndex) => lineElementsRef.current.get(lineIndex))
      .filter((element): element is HTMLButtonElement => Boolean(element));
    if (!viewport || elements.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    const bounds = elements.map((element) => element.getBoundingClientRect());
    const groupTop = Math.min(...bounds.map((rect) => rect.top));
    const groupBottom = Math.max(...bounds.map((rect) => rect.bottom));
    const anchor = density === "fullscreen" ? 0.4 : 0.3;
    const target = viewport.scrollTop
      + (groupTop + groupBottom) / 2
      - viewportRect.top
      - viewportRect.height * anchor;
    const targetTop = Math.min(
      Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      Math.max(0, target),
    );
    const startTop = viewport.scrollTop;
    const distance = targetTop - startTop;
    const duration = lyricScrollDurationMs(nextIntervalMs, distance, reduceMotion);
    cancelAutomaticScroll();

    const finish = () => {
      animationFrameRef.current = null;
      if (completeReturn && followModeRef.current === "returning") {
        setMode(nextLyricFollowMode("returning", "return-completed"));
      }
    };
    if (duration === 0) {
      viewport.scrollTop = targetTop;
      finish();
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = lyricScrollProgress((now - startedAt) / duration);
      viewport.scrollTop = startTop + distance * progress;
      if (now - startedAt < duration) animationFrameRef.current = requestAnimationFrame(step);
      else {
        viewport.scrollTop = targetTop;
        finish();
      }
    };
    animationFrameRef.current = requestAnimationFrame(step);
  }, [cancelAutomaticScroll, density, nextIntervalMs, reduceMotion, setMode]);

  const enterBrowsing = useCallback(() => {
    cancelAutomaticScroll();
    setMode(nextLyricFollowMode(followModeRef.current, "user-browse"));
  }, [cancelAutomaticScroll, setMode]);

  const beginPointerInteraction = (x: number, y: number) => {
    pointerStartRef.current = { x, y };
    cancelAutomaticScroll();
  };

  const continuePointerInteraction = (x: number, y: number) => {
    const start = pointerStartRef.current;
    if (!start || Math.hypot(x - start.x, y - start.y) <= 10) return;
    pointerStartRef.current = null;
    enterBrowsing();
  };

  useLayoutEffect(() => {
    cancelAutomaticScroll();
    lastActiveKeyRef.current = "";
    pendingSeekLineRef.current = null;
    setSeekFailed(false);
    setMode(nextLyricFollowMode(followModeRef.current, "track-changed"));
  }, [cancelAutomaticScroll, lyrics.recordingID, setMode]);

  useLayoutEffect(() => {
    if (activeKey === lastActiveKeyRef.current) return;
    lastActiveKeyRef.current = activeKey;
    if (activeIndices.length === 0 || followSuspended) return;
    const pendingLine = pendingSeekLineRef.current;
    if (pendingLine !== null && activeSet.has(pendingLine)) pendingSeekLineRef.current = null;
    if (followModeRef.current === "following") animateToIndices(activeIndices, false);
    else if (followModeRef.current === "returning") animateToIndices(activeIndices, true);
  }, [activeIndices, activeKey, activeSet, animateToIndices, followSuspended]);

  useLayoutEffect(() => {
    const wasSuspended = followSuspendedRef.current;
    followSuspendedRef.current = followSuspended;
    if (followSuspended) {
      cancelAutomaticScroll();
      return;
    }
    if (wasSuspended && followModeRef.current === "following" && activeIndices.length > 0) {
      animateToIndices(activeIndices, false);
    }
  }, [followSuspended]);

  useEffect(() => () => cancelAutomaticScroll(), [cancelAutomaticScroll]);

  const returnToCurrent = () => {
    if (activeIndices.length === 0) return;
    setSeekFailed(false);
    setMode(nextLyricFollowMode(followModeRef.current, "return-requested"));
    animateToIndices(activeIndices, true);
  };

  const seekLine = (lineIndex: number, fromMs: number) => {
    setSeekFailed(false);
    pendingSeekLineRef.current = lineIndex;
    setMode(nextLyricFollowMode(followModeRef.current, "return-requested"));
    animateToIndices([lineIndex], false);
    const targetTimeMs = playbackTimeForLyricsMs(fromMs, lyricsOffsetMs, durationMs);
    Promise.resolve(onSeek(targetTimeMs)).then(() => {
      if (activeSet.has(lineIndex)) {
        pendingSeekLineRef.current = null;
        animateToIndices(activeIndices, true);
      }
    }).catch(() => {
      pendingSeekLineRef.current = null;
      setSeekFailed(true);
      setMode(nextLyricFollowMode(followModeRef.current, "seek-failed"));
    });
  };

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, lineIndex: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    enterBrowsing();
    const position = lyrics.lines.findIndex((line) => line.lineIndex === lineIndex);
    const nextPosition = event.key === "ArrowDown" ? position + 1 : position - 1;
    const nextLine = lyrics.lines[Math.min(lyrics.lines.length - 1, Math.max(0, nextPosition))];
    if (nextLine) lineElementsRef.current.get(nextLine.lineIndex)?.focus({ preventScroll: false });
  };

  const primaryActiveIndex = activeIndices[0] ?? -1;
  const primaryActivePosition = primaryActiveIndex < 0
    ? -1
    : lyrics.lines.findIndex((line) => line.lineIndex === primaryActiveIndex);
  return (
    <div
      className="lyric-scroller"
      data-density={density}
      data-follow-mode={followMode}
      data-has-active={activeIndices.length > 0}
      style={{ "--lyric-anchor": density === "fullscreen" ? "40%" : "30%" } as CSSProperties}
    >
      <div
        ref={viewportRef}
        className="lyric-scroller-viewport"
        aria-label="歌词"
        onWheel={enterBrowsing}
        onPointerDown={(event) => beginPointerInteraction(event.clientX, event.clientY)}
        onPointerMove={(event) => continuePointerInteraction(event.clientX, event.clientY)}
        onPointerUp={() => { pointerStartRef.current = null; }}
        onPointerCancel={() => { pointerStartRef.current = null; }}
        onKeyDownCapture={(event) => {
          if (userBrowseKeys.has(event.key)) enterBrowsing();
        }}
      >
        <div className="lyric-scroller-spacer lyric-scroller-spacer-start" aria-hidden="true" />
        <div className="lyric-scroller-list">
          {lyrics.lines.map((line, position) => {
            const phase = activeSet.has(line.lineIndex)
              ? "active"
              : lyricTimeMs < line.fromMs ? "future" : "past";
            const distance = primaryActiveIndex < 0
              ? Number.POSITIVE_INFINITY
              : Math.abs(position - primaryActivePosition);
            const proximity = phase === "active" ? "active" : distance <= 1 ? "near" : distance <= 2 ? "middle" : "far";
            const segments = lineSegments.get(line.lineIndex) ?? [{ kind: "plain" as const, text: line.text }];
            const targetTimeMs = playbackTimeForLyricsMs(line.fromMs, lyricsOffsetMs, durationMs);
            const visualClass = density === "column" ? youlyLineVisualClass(phase, proximity) : "";
            return (
              <button
                key={line.lineIndex}
                ref={(element) => {
                  if (element) lineElementsRef.current.set(line.lineIndex, element);
                  else lineElementsRef.current.delete(line.lineIndex);
                }}
                type="button"
                className={`lyric-scroller-line ${visualClass}`.trim()}
                dir="auto"
                tabIndex={lyricLineTabIndex(line.lineIndex, activeIndices, lyrics.lines[0]?.lineIndex ?? line.lineIndex)}
                aria-current={phase === "active" ? "true" : undefined}
                aria-label={`${line.text}，跳转到 ${formatClock(targetTimeMs)}`}
                title={`跳转到 ${formatClock(targetTimeMs)}`}
                data-phase={phase}
                data-voice={mapVoiceClass(line.voiceRole)}
                data-voice-role={line.voiceRole ?? "lead"}
                data-proximity={proximity}
                data-gap={!line.text.trim() || undefined}
                onClick={() => seekLine(line.lineIndex, line.fromMs)}
                onKeyDown={(event) => moveFocus(event, line.lineIndex)}
              >
                <span className="lyric-scroller-line-words">
                  {!line.text.trim() ? <span className="lyric-scroller-gap-dots" aria-hidden="true">···</span> : segments.map((segment, index) => {
                    if (segment.kind !== "word") {
                      return <span key={`${line.lineIndex}:gap:${index}`} className="lyric-scroller-word">{segment.text}</span>;
                    }
                    const progress = phase === "active"
                      ? wordProgressFromTiming(lyricTimeMs, segment.fromMs, segment.toMs)
                      : phase === "past" ? 1 : 0;
                    if (density === "column") {
                      return (
                        <YouLyTimedWord
                          key={`${line.lineIndex}:word:${segment.wordIndex}:${index}`}
                          segment={segment}
                          sampleTimeMs={phase === "active" ? lyricTimeMs : phase === "past" ? segment.toMs : segment.fromMs}
                          phase={phase}
                          reduceMotion={reduceMotion}
                        />
                      );
                    }
                    return (
                      <span
                        key={`${line.lineIndex}:word:${segment.wordIndex}:${index}`}
                        className="lyric-scroller-word"
                        data-has-timing="true"
                        data-timing-kind={segment.timingKind}
                        style={{ "--word-progress": `${progress * 100}%` } as CSSProperties}
                      >
                        {segment.text}
                      </span>
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
        <div className="lyric-scroller-spacer lyric-scroller-spacer-end" aria-hidden="true" />
      </div>

      {followMode === "browsing" && activeIndices.length > 0 ? (
        <button type="button" className="lyric-scroller-return" onClick={returnToCurrent}>
          <span aria-hidden="true">↓</span> 回到当前歌词
        </button>
      ) : null}
      {seekFailed ? <span className="lyric-scroller-status" role="status">跳转失败，请重试</span> : null}
    </div>
  );
}
