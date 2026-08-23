export interface PortableSourceSnapshotV1 {
  sequence: number;
  sentAtUnixMs: number;
  track: {
    provider: string;
    trackID: string;
    title: string;
    artist: string;
    album?: string;
    artworkURL?: string;
    pageURL: string;
  };
  playback: {
    currentTimeMs: number;
    durationMs: number;
    playbackRate: number;
    state: "playing" | "paused" | "buffering" | "ended";
  };
  controls?: {
    seek: boolean;
    playPause: boolean;
    previous: boolean;
    next: boolean;
  };
}

export interface BrowserSourceAdapterV1<TSnapshot extends PortableSourceSnapshotV1> {
  readonly provider: TSnapshot["track"]["provider"];
  readonly snapshotVersion: string;
  isSnapshot(value: unknown): value is TSnapshot;
}

interface SourceEntryV1<TSnapshot> {
  snapshot: TSnapshot;
  receivedAtUnixMs: number;
}

export class SourceRegistryV1<TSnapshot extends PortableSourceSnapshotV1> {
  private readonly tabs = new Map<number, SourceEntryV1<TSnapshot>>();
  private authoritativeTabID?: number;

  constructor(
    private readonly adapter: BrowserSourceAdapterV1<TSnapshot>,
    readonly leaseMilliseconds = 3000,
  ) {}

  accept(tabID: number | undefined, value: unknown, receivedAtUnixMs = Date.now()): boolean {
    if (tabID === undefined || !this.adapter.isSnapshot(value)) return false;
    this.expire(receivedAtUnixMs);
    const currentForTab = this.tabs.get(tabID);
    if (currentForTab && (
      value.sentAtUnixMs < currentForTab.snapshot.sentAtUnixMs
      || (
        value.sentAtUnixMs === currentForTab.snapshot.sentAtUnixMs
        && value.sequence <= currentForTab.snapshot.sequence
      )
    )) return false;

    this.tabs.set(tabID, { snapshot: value, receivedAtUnixMs });
    const current = this.authoritativeEntry;
    if (!current) {
      this.authoritativeTabID = tabID;
      return true;
    }
    if (this.authoritativeTabID === tabID) {
      if (value.playback.state !== "playing") this.promoteAuthoritativeSource();
      return true;
    }
    if (current.snapshot.playback.state !== "playing" && value.playback.state === "playing") {
      this.authoritativeTabID = tabID;
    }
    return true;
  }

  remove(tabID: number): boolean {
    const wasAuthoritative = this.authoritativeTabID === tabID;
    this.tabs.delete(tabID);
    if (!wasAuthoritative) return false;
    this.promoteAuthoritativeSource();
    return true;
  }

  expire(nowUnixMs = Date.now()): boolean {
    const previous = this.authoritativeTabID;
    for (const [tabID, entry] of this.tabs) {
      if (nowUnixMs - entry.receivedAtUnixMs > this.leaseMilliseconds) this.tabs.delete(tabID);
    }
    if (this.authoritativeTabID !== undefined && !this.tabs.has(this.authoritativeTabID)) {
      this.promoteAuthoritativeSource();
    }
    return previous !== this.authoritativeTabID;
  }

  get sourceTabID(): number | undefined {
    return this.authoritativeTabID;
  }

  get snapshot(): TSnapshot | undefined {
    return this.authoritativeEntry?.snapshot;
  }

  snapshotForTab(tabID: number, nowUnixMs = Date.now()): TSnapshot | undefined {
    this.expire(nowUnixMs);
    return this.tabs.get(tabID)?.snapshot;
  }

  private get authoritativeEntry(): SourceEntryV1<TSnapshot> | undefined {
    return this.authoritativeTabID === undefined ? undefined : this.tabs.get(this.authoritativeTabID);
  }

  private promoteAuthoritativeSource(): void {
    const entries = [...this.tabs.entries()];
    entries.sort((left, right) => {
      const leftPlaying = left[1].snapshot.playback.state === "playing" ? 1 : 0;
      const rightPlaying = right[1].snapshot.playback.state === "playing" ? 1 : 0;
      return rightPlaying - leftPlaying
        || right[1].receivedAtUnixMs - left[1].receivedAtUnixMs
        || right[0] - left[0];
    });
    this.authoritativeTabID = entries[0]?.[0];
  }
}
