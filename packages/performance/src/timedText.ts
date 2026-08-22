import type { LyricDocumentV0, LyricLineV0, LyricWordV0 } from "@lyricstage/contracts";

export type TimedTextKind = "phrase" | "word" | "character";
export type TimedTextPrecision = "line" | "word";

export interface TimedTextUnitV1 {
  id: string;
  kind: TimedTextKind;
  text: string;
  fromMs: number;
  toMs: number;
  lineIndex: number;
  wordIndex?: number;
  characterIndex?: number;
  parentID?: string;
  precision: TimedTextPrecision;
}

export interface TimedTextChangeV1 {
  direction: "forward" | "backward" | "stationary";
  current: TimedTextUnitV1[];
  entered: TimedTextUnitV1[];
  left: TimedTextUnitV1[];
}

interface TimedBoundaryV1 {
  atMs: number;
  activeIndices: number[];
}

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      (entry) => entry.segment,
    );
  }
  return Array.from(text);
};

const buildBoundaries = (units: TimedTextUnitV1[]): TimedBoundaryV1[] => {
  const events = new Map<number, { starts: number[]; ends: number[] }>();
  units.forEach((unit, index) => {
    const start = events.get(unit.fromMs) ?? { starts: [], ends: [] };
    start.starts.push(index);
    events.set(unit.fromMs, start);
    const end = events.get(unit.toMs) ?? { starts: [], ends: [] };
    end.ends.push(index);
    events.set(unit.toMs, end);
  });

  const active = new Set<number>();
  return Array.from(events.keys())
    .sort((left, right) => left - right)
    .map((atMs) => {
      const event = events.get(atMs)!;
      event.ends.forEach((index) => active.delete(index));
      event.starts.forEach((index) => active.add(index));
      return { atMs, activeIndices: Array.from(active).sort((left, right) => left - right) };
    });
};

const sampleBoundary = (boundaries: TimedBoundaryV1[], timeMs: number): number[] => {
  let low = 0;
  let high = boundaries.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (boundaries[middle]!.atMs <= timeMs) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match < 0 ? [] : boundaries[match]!.activeIndices;
};

const phraseUnit = (line: LyricLineV0): TimedTextUnitV1 => ({
  id: `phrase:${line.lineIndex}`,
  kind: "phrase",
  text: line.text,
  fromMs: line.fromMs,
  toMs: line.toMs,
  lineIndex: line.lineIndex,
  precision: "line",
});

const wordUnit = (line: LyricLineV0, word: LyricWordV0): TimedTextUnitV1 => ({
  id: `word:${line.lineIndex}:${word.wordIndex}`,
  kind: "word",
  text: word.text,
  fromMs: word.fromMs,
  toMs: word.toMs,
  lineIndex: line.lineIndex,
  wordIndex: word.wordIndex,
  parentID: `phrase:${line.lineIndex}`,
  precision: "word",
});

const characterUnits = (line: LyricLineV0, word: LyricWordV0): TimedTextUnitV1[] =>
  graphemes(word.text).map((text, characterIndex) => ({
    id: `character:${line.lineIndex}:${word.wordIndex}:${characterIndex}`,
    kind: "character",
    text,
    fromMs: word.fromMs,
    toMs: word.toMs,
    lineIndex: line.lineIndex,
    wordIndex: word.wordIndex,
    characterIndex,
    parentID: `word:${line.lineIndex}:${word.wordIndex}`,
    // The contract has word timing, not invented per-character timing.
    precision: "word",
  }));

export class TimedTextIndexV1 {
  readonly phrases: TimedTextUnitV1[];
  readonly words: TimedTextUnitV1[];
  readonly characters: TimedTextUnitV1[];
  readonly #units: Record<TimedTextKind, TimedTextUnitV1[]>;
  readonly #boundaries: Record<TimedTextKind, TimedBoundaryV1[]>;

  constructor(readonly lyrics: LyricDocumentV0) {
    this.phrases = lyrics.lines.map(phraseUnit);
    this.words = lyrics.lines.flatMap((line) => (line.words ?? []).map((word) => wordUnit(line, word)));
    this.characters = lyrics.lines.flatMap((line) =>
      (line.words ?? []).flatMap((word) => characterUnits(line, word)),
    );
    this.#units = {
      phrase: this.phrases,
      word: this.words,
      character: this.characters,
    };
    this.#boundaries = {
      phrase: buildBoundaries(this.phrases),
      word: buildBoundaries(this.words),
      character: buildBoundaries(this.characters),
    };
  }

  activeAt(kind: TimedTextKind, timeMs: number): TimedTextUnitV1[] {
    const units = this.#units[kind];
    return sampleBoundary(this.#boundaries[kind], timeMs)
      .map((index) => units[index]!)
      .filter((unit) => timeMs >= unit.fromMs && timeMs < unit.toMs);
  }

  phrasesAt(timeMs: number): TimedTextUnitV1[] {
    return this.activeAt("phrase", timeMs);
  }

  wordsAt(timeMs: number): TimedTextUnitV1[] {
    return this.activeAt("word", timeMs);
  }

  charactersAt(timeMs: number): TimedTextUnitV1[] {
    return this.activeAt("character", timeMs);
  }

  changesBetween(kind: TimedTextKind, previousTimeMs: number, currentTimeMs: number): TimedTextChangeV1 {
    const before = this.activeAt(kind, previousTimeMs);
    const current = this.activeAt(kind, currentTimeMs);
    const beforeIDs = new Set(before.map((unit) => unit.id));
    const currentIDs = new Set(current.map((unit) => unit.id));
    return {
      direction: currentTimeMs === previousTimeMs
        ? "stationary"
        : currentTimeMs > previousTimeMs
          ? "forward"
          : "backward",
      current,
      entered: current.filter((unit) => !beforeIDs.has(unit.id)),
      left: before.filter((unit) => !currentIDs.has(unit.id)),
    };
  }

  progress(unit: TimedTextUnitV1, timeMs: number): number {
    if (timeMs <= unit.fromMs) return 0;
    if (timeMs >= unit.toMs) return 1;
    return Math.min(1, Math.max(0, (timeMs - unit.fromMs) / Math.max(1, unit.toMs - unit.fromMs)));
  }
}
