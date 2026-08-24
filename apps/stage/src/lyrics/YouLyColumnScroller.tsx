import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LyricDocumentV0 } from "@lyricstage/contracts";
import { playbackTimeForLyricsMs } from "../playback/lyricsTimeOffset";
import { formatClock } from "../column/columnModel";
import {
  buildYouLyColumnLines,
  youLyLineIndexAtTime,
  youLyScrollCompensationPx,
  youLyScrollLookAheadMs,
  type YouLyLineModel,
  type YouLySyllableModel,
} from "./youlyColumnModel";
import { segmentDisplayGraphemes } from "./youlyVisualModel";
import "./YouLyColumnScroller.css";

export interface YouLyColumnScrollerHandle {
  sample: (timeMs: number, force?: boolean) => void;
}

interface YouLyColumnScrollerProps {
  lyrics: LyricDocumentV0;
  lyricsOffsetMs: number;
  durationMs: number;
  reduceMotion: boolean;
  followSuspended?: boolean;
  onSeek: (playbackTimeMs: number) => void | Promise<void>;
  onReady?: (handle: YouLyColumnScrollerHandle) => void;
}

type SyllableRuntime = {
  model: YouLySyllableModel;
  element: HTMLSpanElement;
  chars: HTMLSpanElement[];
  next: SyllableRuntime | null;
  state: number;
  wipeRatio: number;
  preHighlightDurationMs: number;
  preHighlightDelayMs: number;
};

const HIGHLIGHT = 1;
const FINISHED = 2;
const PRE_HIGHLIGHT = 4;
export const youLyBrowseReturnDelayMs = 5_000;

const YouLyWord = memo(function YouLyWord({ syllable }: { syllable: YouLySyllableModel }) {
  const chars = syllable.growable ? segmentDisplayGraphemes(syllable.text) : [];
  return (
    <>
      {syllable.leadingText}
      <span className={`youly-word${syllable.growable ? " growable" : ""}`}>
        <span className="youly-syllable-wrap">
          <span
            className="youly-syllable"
            data-from-ms={syllable.fromMs}
            data-to-ms={syllable.toMs}
            data-timing-kind={syllable.timingKind}
            data-growable={syllable.growable || undefined}
          >
            {syllable.growable
              ? chars.map((char, index) => <span className="youly-char" key={`${index}:${char}`}>{char}</span>)
              : syllable.text}
          </span>
        </span>
      </span>
    </>
  );
});

const lineSelector = ".youly-line";
const positionClasses = [
  "lyrics-activest", "post-active-line", "next-active-line",
  "prev-1", "prev-2", "prev-3", "prev-4",
  "next-1", "next-2", "next-3", "next-4",
];

const YouLyColumnScrollerImpl = forwardRef<YouLyColumnScrollerHandle, YouLyColumnScrollerProps>(
  function YouLyColumnScroller({
    lyrics,
    lyricsOffsetMs,
    durationMs,
    reduceMotion,
    followSuspended = false,
    onSeek,
    onReady,
  }, ref) {
    const models = useMemo(() => buildYouLyColumnLines(lyrics, reduceMotion), [lyrics, reduceMotion]);
    const viewportRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef(new Map<string, HTMLButtonElement>());
    const syllableRuntimesRef = useRef(new Map<string, SyllableRuntime[]>());
    const activeKeysRef = useRef(new Set<string>());
    const activeIndexRef = useRef(-1);
    const scrollIndexRef = useRef(-1);
    const lastTimeRef = useRef(0);
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
    const scrollTimeoutRef = useRef<number | null>(null);
    const browsingReturnTimeoutRef = useRef<number | null>(null);
    const visibilityObserverRef = useRef<IntersectionObserver | null>(null);
    const visibleKeysRef = useRef(new Set<string>());
    const browsingRef = useRef(false);

    const resetSyllable = useCallback((runtime: SyllableRuntime) => {
      runtime.element.classList.remove("highlight", "finished", "pre-highlight", "cleanup");
      runtime.element.style.animation = "";
      runtime.element.style.removeProperty("--pre-wipe-duration");
      runtime.element.style.removeProperty("--pre-wipe-delay");
      runtime.chars.forEach((char) => { char.style.animation = ""; });
      runtime.state = 0;
    }, []);

    const startSyllable = useCallback((runtime: SyllableRuntime) => {
      if (runtime.state & HIGHLIGHT) return;
      const { model, element, chars } = runtime;
      const durationMs = Math.max(1, model.toMs - model.fromMs);
      const rtl = element.closest<HTMLElement>(lineSelector)?.dataset.rtl === "true";
      const first = element.dataset.firstInContainer === "true";

      if (chars.length > 0) {
        const growDurationMs = durationMs * 1.5;
        chars.forEach((char, index) => {
          const wipeStart = Number(char.dataset.wipeStart || 0);
          const wipeDuration = Number(char.dataset.wipeDuration || 0);
          const preArrival = Number(char.dataset.preWipeArrival || 0);
          const preDuration = Number(char.dataset.preWipeDuration || 100);
          const animations: string[] = [
            `youly-grow-dynamic ${growDurationMs}ms ease-in-out ${durationMs * 0.09 * index}ms forwards`,
          ];
          if (index > 0 && preDuration > 0) {
            animations.push(`youly-pre-wipe-char ${preDuration}ms linear ${preArrival - preDuration}ms forwards`);
          }
          if (wipeDuration > 0) {
            const wipe = first && index === 0
              ? rtl ? "youly-start-wipe-rtl" : "youly-start-wipe"
              : rtl ? "youly-wipe-rtl" : "youly-wipe";
            animations.push(`${wipe} ${durationMs * wipeDuration}ms linear ${durationMs * wipeStart}ms forwards`);
          }
          char.style.animation = animations.join(", ");
        });
      } else {
        const animation = model.text === "•"
          ? "youly-fade-gap"
          : first ? rtl ? "youly-start-wipe-rtl" : "youly-start-wipe" : rtl ? "youly-wipe-rtl" : "youly-wipe";
        element.style.animation = `${animation} ${durationMs * runtime.wipeRatio}ms linear forwards`;
      }

      if (runtime.next) {
        const next = runtime.next;
        next.element.classList.add("pre-highlight");
        next.element.style.setProperty("--pre-wipe-duration", `${runtime.preHighlightDurationMs}ms`);
        next.element.style.setProperty("--pre-wipe-delay", `${runtime.preHighlightDelayMs}ms`);
        next.state |= PRE_HIGHLIGHT;
      }
      element.classList.remove("pre-highlight");
      element.classList.add("highlight");
      runtime.state = (runtime.state & ~PRE_HIGHLIGHT) | HIGHLIGHT;
    }, []);

    const updateSyllables = useCallback((model: YouLyLineModel, timeMs: number) => {
      for (const runtime of syllableRuntimesRef.current.get(model.key) ?? []) {
        if (timeMs >= runtime.model.fromMs && timeMs <= runtime.model.toMs) {
          startSyllable(runtime);
          if (runtime.state & FINISHED) {
            runtime.element.classList.remove("finished");
            runtime.state &= ~FINISHED;
          }
        } else if (timeMs > runtime.model.toMs) {
          if (!(runtime.state & FINISHED)) {
            startSyllable(runtime);
            runtime.element.classList.add("finished");
            runtime.state |= FINISHED;
          }
        } else if (runtime.state !== 0) {
          resetSyllable(runtime);
        }
      }
    }, [resetSyllable, startSyllable]);

    const animateScroll = useCallback((index: number, force: boolean, duration = 300) => {
      const viewport = viewportRef.current;
      const target = models[index] && lineRefs.current.get(models[index].key);
      if (!viewport || !target) return;
      const targetTop = Math.max(0, target.offsetTop - viewport.clientHeight * 0.25);
      const delta = youLyScrollCompensationPx(viewport.scrollTop, targetTop);
      if (Math.abs(delta) < 1 && !force) return;

      if (scrollTimeoutRef.current !== null) window.clearTimeout(scrollTimeoutRef.current);
      const lines = Array.from(lineRefs.current.values());
      lines.forEach((line) => {
        line.classList.remove("scroll-animate");
        line.style.removeProperty("--scroll-delta");
        line.style.removeProperty("--lyrics-line-delay");
        line.style.removeProperty("--scroll-duration");
      });
      if (force) {
        viewport.scrollTo({ top: targetTop, behavior: reduceMotion ? "auto" : "smooth" });
        return;
      }
      viewport.scrollTop = targetTop;
      if (reduceMotion) return;

      duration = Math.min(450, duration);
      const scrollDuration = duration + 100;
      const delayIncrement = duration * 0.1;
      const scrollingDown = delta >= 0;
      let visibleMin = index;
      let visibleMax = index;
      models.forEach((model, modelIndex) => {
        if (!visibleKeysRef.current.has(model.key)) return;
        visibleMin = Math.min(visibleMin, modelIndex);
        visibleMax = Math.max(visibleMax, modelIndex);
      });
      const start = Math.min(visibleMin, index);
      const end = Math.min(models.length, Math.max(visibleMax, index) + 20);
      const ordered = Array.from({ length: end - start }, (_, offset) => lineRefs.current.get(models[start + offset]!.key))
        .filter((line): line is HTMLButtonElement => Boolean(line));
      if (!scrollingDown) ordered.reverse();
      let delayCount = 0;
      ordered.forEach((line) => {
        const model = models.find((candidate) => candidate.key === line.dataset.key);
        const lineIndex = model ? models.indexOf(model) : -1;
        const delayedSide = scrollingDown ? lineIndex >= index : lineIndex <= index;
        const delay = delayedSide && !model?.gap ? delayCount++ * delayIncrement : 0;
        line.style.setProperty("--scroll-delta", `${delta}px`);
        line.style.setProperty("--lyrics-line-delay", `${delay}ms`);
        line.style.setProperty("--scroll-duration", `${scrollDuration}ms`);
        line.classList.add("scroll-animate");
      });
      scrollTimeoutRef.current = window.setTimeout(() => {
        ordered.forEach((line) => {
          line.classList.remove("scroll-animate");
          line.style.removeProperty("--scroll-delta");
          line.style.removeProperty("--lyrics-line-delay");
          line.style.removeProperty("--scroll-duration");
        });
        scrollTimeoutRef.current = null;
      }, scrollDuration + delayCount * delayIncrement + 50);
    }, [models, reduceMotion]);

    const updatePositionClasses = useCallback((index: number, force: boolean, duration = 300) => {
      lineRefs.current.forEach((line) => line.classList.remove(...positionClasses));
      const active = models[index];
      if (!active) return;
      lineRefs.current.get(active.key)?.classList.add("lyrics-activest");
      for (let candidate = Math.max(0, index - 4); candidate <= Math.min(models.length - 1, index + 4); candidate++) {
        if (candidate === index) continue;
        const distance = candidate - index;
        const line = lineRefs.current.get(models[candidate]!.key);
        if (!line) continue;
        if (distance === -1) line.classList.add("post-active-line");
        else if (distance === 1) line.classList.add("next-active-line");
        else line.classList.add(distance < 0 ? `prev-${Math.abs(distance)}` : `next-${distance}`);
      }
      animateScroll(index, force, duration);
      scrollIndexRef.current = index;
    }, [animateScroll, models]);

    const sample = useCallback((timeMs: number, force = false) => {
      const previousTimeMs = lastTimeRef.current;
      lastTimeRef.current = timeMs;
      if (followSuspended || models.length === 0) return;
      if (timeMs + 120 < previousTimeMs) force = true;
      const currentIndex = youLyLineIndexAtTime(models, timeMs, activeIndexRef.current);
      const lookAheadMs = youLyScrollLookAheadMs(models, Math.max(0, currentIndex));
      const scrollIndex = Math.max(0, youLyLineIndexAtTime(models, timeMs + lookAheadMs, currentIndex));
      const nextActive = new Set<string>();
      const from = Math.max(0, currentIndex - 3);
      const to = Math.min(models.length - 1, currentIndex + 3);
      for (let index = from; index <= to; index++) {
        const model = models[index]!;
        if (timeMs >= model.fromMs && timeMs < model.toMs) nextActive.add(model.key);
      }
      activeKeysRef.current.forEach((key) => {
        if (nextActive.has(key)) return;
        const line = lineRefs.current.get(key);
        line?.classList.remove("active");
        (syllableRuntimesRef.current.get(key) ?? []).forEach(resetSyllable);
      });
      nextActive.forEach((key) => lineRefs.current.get(key)?.classList.add("active"));
      activeKeysRef.current = nextActive;
      activeIndexRef.current = currentIndex;
      nextActive.forEach((key) => {
        const model = models.find((candidate) => candidate.key === key);
        if (model) updateSyllables(model, timeMs);
      });
      if (!browsingRef.current && (force || scrollIndex !== scrollIndexRef.current)) updatePositionClasses(scrollIndex, force, lookAheadMs);
    }, [followSuspended, models, resetSyllable, updatePositionClasses, updateSyllables]);

    useImperativeHandle(ref, () => ({ sample }), [sample]);

    useLayoutEffect(() => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      const runtimeMap = new Map<string, SyllableRuntime[]>();
      lineRefs.current.forEach((line, key) => {
        const model = models.find((candidate) => candidate.key === key);
        if (!model) return;
        const syllableElements = Array.from(line.querySelectorAll<HTMLSpanElement>(".youly-syllable"));
        const runtimes = model.syllables.map((syllable, index): SyllableRuntime => {
          const element = syllableElements[index]!;
          const chars = Array.from(element.querySelectorAll<HTMLSpanElement>(".youly-char"));
          const style = getComputedStyle(element);
          if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const measure = (text: string) => context?.measureText(text).width || Math.max(1, text.length * 12);
          const textWidth = measure(syllable.text.trim());
          const fullWidth = measure(syllable.text);
          const durationMs = Math.max(1, syllable.toMs - syllable.fromMs);
          element.dataset.firstInContainer = index === 0 ? "true" : "false";
          if (chars.length > 0) {
            const widths = chars.map((char) => measure(char.textContent || ""));
            const totalWidth = widths.reduce((sum, width) => sum + width, 0) || 1;
            const fontSize = Number.parseFloat(style.fontSize) || 25;
            const gradientDuration = (0.375 * fontSize) / (totalWidth / durationMs);
            let cumulative = 0;
            const progress = Math.min(1, Math.max(0, (durationMs - 1_000) / 4_000)) ** 3;
            const wordLength = chars.length;
            let decay = 0;
            if (wordLength > 5) decay += Math.min((wordLength - 5) / 3, 1) * 0.4;
            if (durationMs < 1_500) decay += Math.max(0, 1 - (durationMs - 1_000) / 500) * 0.4;
            decay = Math.min(decay, 0.85);
            chars.forEach((char, charIndex) => {
              const width = widths[charIndex]!;
              const start = cumulative / totalWidth;
              const duration = width / totalWidth;
              char.dataset.wipeStart = start.toFixed(4);
              char.dataset.wipeDuration = duration.toFixed(4);
              char.dataset.preWipeArrival = (durationMs * start).toFixed(2);
              char.dataset.preWipeDuration = gradientDuration.toFixed(2);
              const decayFactor = 1 - (chars.length > 1 ? charIndex / (chars.length - 1) : 0) * decay;
              const charProgress = progress * decayFactor;
              const maxScale = 1 + (chars.length <= 3 ? 0.07 : 0.05) + charProgress * 0.1;
              const normalized = (maxScale - 1) / 0.13;
              const position = (cumulative + width / 2) / totalWidth;
              char.style.setProperty("--max-scale", maxScale.toFixed(3));
              char.style.setProperty("--shadow-intensity", (0.4 + charProgress * 0.4).toFixed(3));
              char.style.setProperty("--translate-y-peak", (-normalized * 6).toFixed(3));
              char.style.setProperty("--char-offset-x", String((position - 0.5) * 2 * ((maxScale - 1) * 25)));
              cumulative += width;
            });
          }
          return {
            model: syllable,
            element,
            chars,
            next: null,
            state: 0,
            wipeRatio: textWidth > 0 ? textWidth / Math.max(textWidth, fullWidth) : 1,
            preHighlightDurationMs: 0,
            preHighlightDelayMs: 0,
          };
        });
        runtimes.forEach((runtime, index) => {
          const next = runtimes[index + 1] ?? null;
          runtime.next = next;
          const durationMs = Math.max(1, runtime.model.toMs - runtime.model.fromMs);
          const style = getComputedStyle(runtime.element);
          if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const width = context?.measureText(runtime.model.text).width || Math.max(1, runtime.model.text.length * 12);
          const fontSize = Number.parseFloat(style.fontSize) || 25;
          const gradientDuration = width > 0 ? (0.375 * fontSize) / (width / durationMs) : 0;
          runtime.preHighlightDurationMs = gradientDuration;
          runtime.preHighlightDelayMs = durationMs - gradientDuration;
        });
        runtimeMap.set(key, runtimes);
      });
      syllableRuntimesRef.current = runtimeMap;
      activeKeysRef.current.clear();
      activeIndexRef.current = -1;
      scrollIndexRef.current = -1;

      visibilityObserverRef.current?.disconnect();
      if (viewportRef.current) {
        visibilityObserverRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            entry.target.classList.toggle("viewport-hidden", !entry.isIntersecting);
            const key = (entry.target as HTMLElement).dataset.key;
            if (!key) return;
            if (entry.isIntersecting) visibleKeysRef.current.add(key);
            else visibleKeysRef.current.delete(key);
          });
        }, { root: viewportRef.current, rootMargin: "200px 0px", threshold: 0.1 });
        lineRefs.current.forEach((line) => visibilityObserverRef.current?.observe(line));
      }
      onReady?.({ sample });
      return () => {
        visibilityObserverRef.current?.disconnect();
        if (scrollTimeoutRef.current !== null) window.clearTimeout(scrollTimeoutRef.current);
        if (browsingReturnTimeoutRef.current !== null) window.clearTimeout(browsingReturnTimeoutRef.current);
      };
    }, [models, onReady, sample]);

    const returnToCurrent = () => {
      if (browsingReturnTimeoutRef.current !== null) {
        window.clearTimeout(browsingReturnTimeoutRef.current);
        browsingReturnTimeoutRef.current = null;
      }
      containerRef.current?.classList.remove("not-focused", "user-scrolling");
      browsingRef.current = false;
      window.requestAnimationFrame(() => sample(lastTimeRef.current, true));
    };
    const scheduleReturnToCurrent = () => {
      if (browsingReturnTimeoutRef.current !== null) window.clearTimeout(browsingReturnTimeoutRef.current);
      browsingReturnTimeoutRef.current = window.setTimeout(returnToCurrent, youLyBrowseReturnDelayMs);
    };
    const enterBrowsing = () => {
      containerRef.current?.classList.add("not-focused", "user-scrolling");
      browsingRef.current = true;
      scheduleReturnToCurrent();
    };
    const pointerMove = (event: ReactPointerEvent) => {
      const start = pointerStartRef.current;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 10) return;
      pointerStartRef.current = null;
      enterBrowsing();
    };
    return (
      <div className="youly-column-shell">
        <div
          ref={viewportRef}
          className="youly-column-viewport"
          aria-label="歌词"
          onWheel={enterBrowsing}
          onScroll={() => { if (browsingRef.current) scheduleReturnToCurrent(); }}
          onPointerDown={(event) => { pointerStartRef.current = { x: event.clientX, y: event.clientY }; }}
          onPointerMove={pointerMove}
          onPointerUp={() => { pointerStartRef.current = null; }}
          onPointerCancel={() => { pointerStartRef.current = null; }}
        >
          <div ref={containerRef} className="youly-column-container blur-inactive-enabled hide-offscreen">
            {models.map((line) => (
              <button
                ref={(element) => {
                  if (element) lineRefs.current.set(line.key, element);
                  else lineRefs.current.delete(line.key);
                }}
                key={line.key}
                type="button"
                className={`youly-line singer-${line.side}${line.gap ? " lyrics-gap" : ""}${line.rtl ? " rtl-text" : ""}`}
                data-key={line.key}
                data-rtl={line.rtl}
                aria-label={line.lineIndex === null ? "间奏" : `${line.text}，跳转到 ${formatClock(line.fromMs)}`}
                onClick={() => {
                  const target = playbackTimeForLyricsMs(line.fromMs - 50, lyricsOffsetMs, durationMs);
                  updatePositionClasses(models.indexOf(line), true);
                  void onSeek(target);
                }}
              >
                <span className="youly-line-container">
                  <span className="youly-main-vocal-container">
                    {line.gap
                      ? line.syllables.map((syllable, index) => (
                        <span className="youly-word" key={`${line.key}:${index}`}><span className="youly-syllable-wrap"><span className="youly-syllable" data-from-ms={syllable.fromMs} data-to-ms={syllable.toMs}>{syllable.text}</span></span></span>
                      ))
                      : line.syllables.length > 0
                        ? <>{line.syllables.map((syllable, index) => <YouLyWord key={`${line.key}:${index}`} syllable={syllable} />)}{line.trailingText}</>
                        : line.text}
                  </span>
                </span>
              </button>
            ))}
            <div className="youly-column-end-space" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  },
);

export const YouLyColumnScroller = memo(YouLyColumnScrollerImpl);
