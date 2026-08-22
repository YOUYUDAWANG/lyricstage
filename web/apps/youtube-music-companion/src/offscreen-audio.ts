import {
  compileMusicMapV1,
  compileVocalTimingSampleV1,
  compileVocalTimingMapV1,
  type MusicFeatureFrameV1,
  type VocalTimingSampleV1,
} from "@lyricstage/performance";

interface CaptureClock {
  currentTimeMs: number;
  playbackRate: number;
  state: "playing" | "paused" | "buffering" | "ended";
  receivedAtMs: number;
}

type AudioCaptureOwnerScope = "boundTab" | "followAuthority";

interface CaptureSession {
  captureID: string;
  trackID: string;
  tabID: number;
  generation: number;
  ownerScope: AudioCaptureOwnerScope;
  durationMs: number;
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  centerAnalyser: AnalyserNode;
  sideAnalyser: AnalyserNode;
  framesByBucket: Map<number, MusicFeatureFrameV1>;
  vocalSamplesByBucket: Map<number, VocalTimingSampleV1>;
  previousSpectrum: Float32Array;
  previousCenterSpectrum: Float32Array;
  clock: CaptureClock;
  interval: ReturnType<typeof setInterval>;
  publishInterval: ReturnType<typeof setInterval>;
  vocalPublishInterval: ReturnType<typeof setInterval>;
}

interface PendingCapture {
  captureID: string;
  trackID: string;
  tabID: number;
  generation: number;
  ownerScope: AudioCaptureOwnerScope;
  lifecycleGeneration: number;
  durationMs: number;
  clock: CaptureClock;
  stream?: MediaStream;
  context?: AudioContext;
}

interface RuntimeAPI {
  onMessage: {
    addListener(listener: (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void): void;
  };
  sendMessage(message: unknown): Promise<unknown>;
}

const runtime = (globalThis as typeof globalThis & { chrome: { runtime: RuntimeAPI } }).chrome.runtime;
let session: CaptureSession | undefined;
let pendingCapture: PendingCapture | undefined;
let captureLifecycleGeneration = 0;

const unit = (value: number): number => Math.min(1, Math.max(0, value));

const playbackPosition = (value: CaptureClock): number => {
  if (value.state !== "playing") return value.currentTimeMs;
  return value.currentTimeMs + (performance.now() - value.receivedAtMs) * value.playbackRate;
};

const bandEnergy = (spectrum: Float32Array, from: number, to: number): number => {
  if (to <= from) return 0;
  let sum = 0;
  for (let index = from; index < to; index += 1) {
    const db = spectrum[index] ?? -100;
    sum += unit((db + 100) / 70);
  }
  return unit(sum / (to - from));
};

const stopCurrentSession = async () => {
  const current = session;
  session = undefined;
  if (!current) return;
  clearInterval(current.interval);
  clearInterval(current.publishInterval);
  clearInterval(current.vocalPublishInterval);
  current.stream.getTracks().forEach((track) => track.stop());
  await current.context.close().catch(() => undefined);
};

const stopAll = async () => {
  captureLifecycleGeneration += 1;
  const pending = pendingCapture;
  pendingCapture = undefined;
  await Promise.all([
    pending ? releasePendingResources(pending) : Promise.resolve(),
    stopCurrentSession(),
  ]);
};

const releasePendingResources = async (pending: PendingCapture) => {
  const stream = pending.stream;
  const context = pending.context;
  pending.stream = undefined;
  pending.context = undefined;
  stream?.getTracks().forEach((track) => track.stop());
  await context?.close().catch(() => undefined);
};

const stop = async (
  captureID: string,
  trackID: string,
  tabID: number,
  generation: number,
  ownerScope: AudioCaptureOwnerScope,
) => {
  const matchesPending = pendingCapture?.captureID === captureID
    && pendingCapture.trackID === trackID
    && pendingCapture.tabID === tabID
    && pendingCapture.generation === generation
    && pendingCapture.ownerScope === ownerScope;
  const matchesSession = session?.captureID === captureID
    && session.trackID === trackID
    && session.tabID === tabID
    && session.generation === generation
    && session.ownerScope === ownerScope;
  if (!matchesPending && !matchesSession) return;
  captureLifecycleGeneration += 1;
  const pending = matchesPending ? pendingCapture : undefined;
  if (pending) pendingCapture = undefined;
  if (pending) await releasePendingResources(pending);
  if (matchesSession) await stopCurrentSession();
};

const notifyEndedAndStop = (current: CaptureSession) => {
  void runtime.sendMessage({
    type: "lyricstage-audio-capture-ended",
    captureID: current.captureID,
    trackID: current.trackID,
    tabID: current.tabID,
    generation: current.generation,
    ownerScope: current.ownerScope,
  }).catch(() => undefined);
  void stop(
    current.captureID,
    current.trackID,
    current.tabID,
    current.generation,
    current.ownerScope,
  ).catch(() => undefined);
};

const publish = () => {
  const current = session;
  if (!current) return;
  const frames = [...current.framesByBucket.values()].sort((left, right) => left.atMs - right.atMs);
  const musicMap = compileMusicMapV1(current.durationMs, frames);
  if (!musicMap) return;
  void runtime.sendMessage({
    type: "lyricstage-audio-map-update",
    captureID: current.captureID,
    trackID: current.trackID,
    tabID: current.tabID,
    generation: current.generation,
    ownerScope: current.ownerScope,
    musicMap,
  })
    .catch(() => undefined);
};

const publishVocalTiming = () => {
  const current = session;
  if (!current) return;
  const samples = [...current.vocalSamplesByBucket.values()].sort((left, right) => left.atMs - right.atMs);
  const vocalTimingMap = compileVocalTimingMapV1(current.durationMs, samples);
  if (!vocalTimingMap) return;
  void runtime.sendMessage({
    type: "lyricstage-vocal-timing-update",
    captureID: current.captureID,
    trackID: current.trackID,
    tabID: current.tabID,
    generation: current.generation,
    ownerScope: current.ownerScope,
    vocalTimingMap,
  }).catch(() => undefined);
};

const sample = () => {
  const current = session;
  if (!current || current.clock.state !== "playing") return;
  const atMs = Math.min(current.durationMs, Math.max(0, playbackPosition(current.clock)));
  const spectrum = new Float32Array(current.analyser.frequencyBinCount);
  const centerSpectrum = new Float32Array(current.centerAnalyser.frequencyBinCount);
  const sideSpectrum = new Float32Array(current.sideAnalyser.frequencyBinCount);
  const waveform = new Float32Array(current.analyser.fftSize);
  current.analyser.getFloatFrequencyData(spectrum);
  current.centerAnalyser.getFloatFrequencyData(centerSpectrum);
  current.sideAnalyser.getFloatFrequencyData(sideSpectrum);
  current.analyser.getFloatTimeDomainData(waveform);
  let squareSum = 0;
  for (const value of waveform) squareSum += value * value;
  const energy = unit(Math.sqrt(squareSum / waveform.length) * 4.5);
  const nyquist = current.context.sampleRate / 2;
  const bin = (frequency: number) => Math.min(spectrum.length, Math.max(0, Math.round(frequency / nyquist * spectrum.length)));
  const bass = bandEnergy(spectrum, bin(35), bin(250));
  const mid = bandEnergy(spectrum, bin(250), bin(2_500));
  const treble = bandEnergy(spectrum, bin(2_500), bin(12_000));
  let weighted = 0;
  let magnitude = 0;
  let flux = 0;
  for (let index = 0; index < spectrum.length; index += 1) {
    const normalized = unit(((spectrum[index] ?? -100) + 100) / 70);
    magnitude += normalized;
    weighted += normalized * index / spectrum.length;
    flux += Math.max(0, normalized - (current.previousSpectrum[index] ?? 0));
    current.previousSpectrum[index] = normalized;
  }
  const brightness = unit(magnitude > 0 ? weighted / magnitude * 3 : 0);
  flux = unit(flux / spectrum.length * 12);
  const onset = flux > 0.2 && energy > 0.08 ? unit((flux - 0.15) * 2.5) : 0;
  const stereoWidth = unit(0.18 + Math.abs(treble - mid) * 0.55);
  const frame: MusicFeatureFrameV1 = { atMs, energy, bass, mid, treble, brightness, flux, onset, stereoWidth };
  current.framesByBucket.set(Math.round(atMs / 33), frame);

  const centerMid = bandEnergy(centerSpectrum, bin(180), bin(3_600));
  const centerBass = bandEnergy(centerSpectrum, bin(45), bin(180));
  const centerTreble = bandEnergy(centerSpectrum, bin(3_600), bin(10_000));
  const sideMid = bandEnergy(sideSpectrum, bin(180), bin(3_600));
  let centerFlux = 0;
  let centerBins = 0;
  for (let index = bin(150); index < bin(4_500); index += 1) {
    const normalized = unit(((centerSpectrum[index] ?? -100) + 100) / 70);
    centerFlux += Math.max(0, normalized - (current.previousCenterSpectrum[index] ?? 0));
    current.previousCenterSpectrum[index] = normalized;
    centerBins += 1;
  }
  centerFlux = unit(centerBins > 0 ? centerFlux / centerBins * 11 : 0);
  const vocalSample = compileVocalTimingSampleV1({
    atMs,
    energy,
    centerBass,
    centerMid,
    centerTreble,
    sideMid,
    centerFlux,
  });
  if (vocalSample) current.vocalSamplesByBucket.set(Math.round(atMs / 50), vocalSample);
};

const start = async (
  streamID: string,
  captureID: string,
  trackID: string,
  tabID: number,
  durationMs: number,
  clock: CaptureClock,
  generation: number,
  ownerScope: AudioCaptureOwnerScope,
  lifecycleGeneration: number,
) => {
  const previousPending = pendingCapture;
  const pending: PendingCapture = {
    captureID,
    trackID,
    tabID,
    generation,
    ownerScope,
    lifecycleGeneration,
    durationMs,
    clock,
  };
  pendingCapture = pending;
  await Promise.all([
    previousPending ? releasePendingResources(previousPending) : Promise.resolve(),
    stopCurrentSession(),
  ]);
  if (pendingCapture !== pending || lifecycleGeneration !== captureLifecycleGeneration) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamID },
      } as MediaTrackConstraints,
      video: false,
    });
    if (pendingCapture !== pending || lifecycleGeneration !== captureLifecycleGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    pending.stream = stream;
    const context = new AudioContext();
    pending.context = context;
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.48;
    source.connect(analyser);
    // tabCapture removes the tab audio from normal output. Reconnect the same
    // stream to the destination so starting the performance never mutes YTM.
    analyser.connect(context.destination);

    const splitter = context.createChannelSplitter(2);
    const centerAnalyser = context.createAnalyser();
    const sideAnalyser = context.createAnalyser();
    centerAnalyser.fftSize = 2048;
    sideAnalyser.fftSize = 2048;
    centerAnalyser.smoothingTimeConstant = 0.32;
    sideAnalyser.smoothingTimeConstant = 0.32;
    const centerLeft = context.createGain();
    const centerRight = context.createGain();
    const sideLeft = context.createGain();
    const sideRight = context.createGain();
    centerLeft.gain.value = 0.5;
    centerRight.gain.value = 0.5;
    sideLeft.gain.value = 0.5;
    sideRight.gain.value = -0.5;
    source.connect(splitter);
    splitter.connect(centerLeft, 0);
    splitter.connect(centerRight, 1);
    splitter.connect(sideLeft, 0);
    splitter.connect(sideRight, 1);
    centerLeft.connect(centerAnalyser);
    centerRight.connect(centerAnalyser);
    sideLeft.connect(sideAnalyser);
    sideRight.connect(sideAnalyser);
    const analysisSink = context.createGain();
    analysisSink.gain.value = 0;
    centerAnalyser.connect(analysisSink);
    sideAnalyser.connect(analysisSink);
    analysisSink.connect(context.destination);
    await context.resume();
    if (pendingCapture !== pending || lifecycleGeneration !== captureLifecycleGeneration) {
      await releasePendingResources(pending);
      return;
    }
    pending.stream = undefined;
    pending.context = undefined;
    const next: CaptureSession = {
      captureID,
      trackID,
      tabID,
      generation,
      ownerScope,
      durationMs,
      stream,
      context,
      analyser,
      centerAnalyser,
      sideAnalyser,
      framesByBucket: new Map(),
      vocalSamplesByBucket: new Map(),
      previousSpectrum: new Float32Array(analyser.frequencyBinCount),
      previousCenterSpectrum: new Float32Array(centerAnalyser.frequencyBinCount),
      clock,
      interval: setInterval(sample, 1000 / 30),
      publishInterval: setInterval(publish, 4_000),
      vocalPublishInterval: setInterval(publishVocalTiming, 500),
    };
    pendingCapture = undefined;
    session = next;
    stream.getTracks().forEach((track) => {
      const eventTrack = track as MediaStreamTrack & {
        addEventListener?: (type: "ended", listener: () => void, options?: { once?: boolean }) => void;
      };
      eventTrack.addEventListener?.("ended", () => {
        if (session !== next) return;
        notifyEndedAndStop(next);
      }, { once: true });
    });
    void runtime.sendMessage({
      type: "lyricstage-audio-capture-ready",
      captureID,
      trackID,
      tabID,
      generation,
      ownerScope,
    })
      .catch(() => undefined);
  } catch (error) {
    await releasePendingResources(pending);
    throw error;
  }
};

const captureStatus = () => {
  const current = session;
  if (current) {
    const frames = [...current.framesByBucket.values()].sort((left, right) => left.atMs - right.atMs);
    const samples = [...current.vocalSamplesByBucket.values()].sort((left, right) => left.atMs - right.atMs);
    const latestMusicMap = compileMusicMapV1(current.durationMs, frames) ?? undefined;
    const latestVocalMap = compileVocalTimingMapV1(current.durationMs, samples) ?? undefined;
    const coverageReady = Boolean(
      latestMusicMap
      && latestMusicMap.analyzedMs >= Math.min(28_000, Math.max(8_000, latestMusicMap.durationMs * 0.08)),
    );
    return {
      type: "lyricstage-audio-capture-status",
      active: true,
      captureID: current.captureID,
      trackID: current.trackID,
      tabID: current.tabID,
      generation: current.generation,
      ownerScope: current.ownerScope,
      durationMs: current.durationMs,
      status: coverageReady ? "ready" : "analyzing",
      ...(latestMusicMap ? { latestMusicMap } : {}),
      ...(latestVocalMap ? { latestVocalMap } : {}),
    };
  }
  const pending = pendingCapture;
  if (pending) {
    return {
      type: "lyricstage-audio-capture-status",
      active: true,
      captureID: pending.captureID,
      trackID: pending.trackID,
      tabID: pending.tabID,
      generation: pending.generation,
      ownerScope: pending.ownerScope,
      durationMs: pending.durationMs,
      status: "analyzing",
    };
  }
  return { type: "lyricstage-audio-capture-status", active: false };
};

runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Record<string, unknown>;
  if (request.type === "lyricstage-audio-capture-status-request") {
    sendResponse(captureStatus());
    return;
  }
  if (request.type === "lyricstage-audio-capture-stop-all") {
    void stopAll().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }
  if (request.type === "lyricstage-audio-capture-stop") {
    if (
      typeof request.captureID === "string"
      && typeof request.trackID === "string"
      && typeof request.tabID === "number"
      && Number.isInteger(request.tabID)
      && typeof request.generation === "number"
      && Number.isInteger(request.generation)
      && (request.ownerScope === "boundTab" || request.ownerScope === "followAuthority")
    ) {
      void stop(
        request.captureID,
        request.trackID,
        request.tabID,
        request.generation,
        request.ownerScope,
      ).catch(() => undefined);
    }
    return;
  }
  if (
    request.type === "lyricstage-audio-clock"
    && session
    && request.captureID === session.captureID
    && request.trackID === session.trackID
    && request.tabID === session.tabID
    && request.generation === session.generation
    && request.ownerScope === session.ownerScope
  ) {
    const clock = request.clock as Partial<CaptureClock> | undefined;
    if (clock && Number.isFinite(clock.currentTimeMs) && Number.isFinite(clock.playbackRate)) {
      session.clock = {
        currentTimeMs: Number(clock.currentTimeMs),
        playbackRate: Number(clock.playbackRate),
        state: clock.state === "playing" || clock.state === "paused" || clock.state === "buffering" || clock.state === "ended"
          ? clock.state
          : "paused",
        receivedAtMs: performance.now(),
      };
      if (session.clock.state === "ended") {
        notifyEndedAndStop(session);
      }
    }
    return;
  }
  if (
    request.type === "lyricstage-audio-capture-start"
    && typeof request.streamID === "string"
    && typeof request.captureID === "string"
    && typeof request.trackID === "string"
    && typeof request.tabID === "number"
    && Number.isInteger(request.tabID)
    && typeof request.generation === "number"
    && Number.isInteger(request.generation)
    && request.generation > 0
    && (request.ownerScope === "boundTab" || request.ownerScope === "followAuthority")
    && typeof request.durationMs === "number"
    && request.clock && typeof request.clock === "object"
  ) {
    const initial = request.clock as Omit<CaptureClock, "receivedAtMs">;
    const lifecycleGeneration = ++captureLifecycleGeneration;
    const generation = request.generation;
    const ownerScope = request.ownerScope;
    const captureID = request.captureID;
    const trackID = request.trackID;
    const tabID = request.tabID;
    void start(
      request.streamID,
      captureID,
      trackID,
      tabID,
      request.durationMs,
      { ...initial, receivedAtMs: performance.now() },
      generation,
      ownerScope,
      lifecycleGeneration,
    )
      .catch((error) => {
        if (
          pendingCapture?.captureID !== captureID
          || pendingCapture.trackID !== trackID
          || pendingCapture.tabID !== tabID
          || pendingCapture.generation !== generation
          || pendingCapture.ownerScope !== ownerScope
          || pendingCapture.lifecycleGeneration !== lifecycleGeneration
          || lifecycleGeneration !== captureLifecycleGeneration
        ) return;
        pendingCapture = undefined;
        void runtime.sendMessage({
          type: "lyricstage-audio-capture-error",
          captureID,
          trackID,
          tabID,
          generation,
          ownerScope,
          reason: error instanceof Error ? error.message.slice(0, 160) : "capture-failed",
        }).catch(() => undefined);
      });
  }
});
