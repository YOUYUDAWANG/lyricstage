import type { MusicMapV1, ReactiveBusV1, VocalTimingMapV1 } from "@lyricstage/performance";

export interface ExtensionPort {
  name: string;
  sender?: { tab?: ExtensionTab; url?: string };
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface ExtensionTab {
  id?: number;
  url?: string;
}

export interface ExtensionChrome {
  runtime: {
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    getContexts?(options: { contextTypes: string[]; documentUrls: string[] }): Promise<unknown[]>;
    onConnect: { addListener(listener: (port: ExtensionPort) => void): void };
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: { tab?: ExtensionTab; url?: string },
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  offscreen: {
    createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
    closeDocument?(): Promise<void>;
  };
  tabCapture: {
    getMediaStreamId(options: { targetTabId: number }): Promise<string>;
  };
  tabs: {
    create(options: { url: string; active?: boolean }): Promise<ExtensionTab>;
    query(options: Record<string, unknown>): Promise<ExtensionTab[]>;
    sendMessage(tabID: number, message: unknown): Promise<unknown>;
    update(tabID: number, options: { active: boolean }): Promise<ExtensionTab>;
    onRemoved: { addListener(listener: (tabID: number) => void): void };
    onUpdated: { addListener(listener: (tabID: number, change: { url?: string }) => void): void };
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
}

export type AudioAnalysisStatus = "analyzing" | "ready" | "error";
export type AudioCaptureOwnerScope = "boundTab" | "followAuthority";

export interface AudioCaptureState {
  captureID: string;
  trackID: string;
  tabID: number;
  durationMs: number;
  generation: number;
  ownerScope: AudioCaptureOwnerScope;
  status: AudioAnalysisStatus;
  reason?: string;
  latestMusicMap?: MusicMapV1;
  latestVocalMap?: VocalTimingMapV1;
  latestReactiveBus?: ReactiveBusV1;
  mapForwarded: boolean;
  expiresAtUnixMs?: number;
  startTask?: Promise<void>;
}

export interface AudioCaptureOperation {
  capture: AudioCaptureState;
  task: Promise<void>;
}

export interface OffscreenAudioCaptureStatus {
  captureID: string;
  trackID: string;
  tabID: number;
  generation: number;
  durationMs: number;
  status: AudioAnalysisStatus;
  ownerScope: AudioCaptureOwnerScope;
  latestMusicMap?: MusicMapV1;
  latestVocalMap?: VocalTimingMapV1;
  latestReactiveBus?: ReactiveBusV1;
}

export type AudioAnalysisReplayState = Omit<AudioCaptureState, "status" | "startTask"> & {
  status: AudioAnalysisStatus | "idle";
};
