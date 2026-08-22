import {
  isYouTubeMusicSnapshotV0,
  type YouTubeMusicBridgeStateV0,
  type YouTubeMusicSnapshotV0,
} from "./protocol";

export class YouTubeMusicSourceRegistryV0 {
  static readonly leaseMilliseconds = 3000;
  private readonly tabs = new Map<number, {
    snapshot: YouTubeMusicSnapshotV0;
    receivedAtUnixMs: number;
  }>();
  private authoritativeTabID?: number;

  accept(tabID: number | undefined, value: unknown, receivedAtUnixMs = Date.now()): boolean {
    if (tabID === undefined || !isYouTubeMusicSnapshotV0(value)) return false;
    this.expire(receivedAtUnixMs);
    const currentForTab = this.tabs.get(tabID);
    if (currentForTab) {
      if (
        value.sentAtUnixMs < currentForTab.snapshot.sentAtUnixMs ||
        (
          value.sentAtUnixMs === currentForTab.snapshot.sentAtUnixMs &&
          value.sequence <= currentForTab.snapshot.sequence
        )
      ) {
        return false;
      }
    }

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

    const currentIsPlaying = current.snapshot.playback.state === "playing";
    const candidateIsPlaying = value.playback.state === "playing";
    if (!currentIsPlaying && candidateIsPlaying) {
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
    const previousAuthoritativeTabID = this.authoritativeTabID;
    for (const [tabID, entry] of this.tabs) {
      if (
        nowUnixMs - entry.receivedAtUnixMs
        > YouTubeMusicSourceRegistryV0.leaseMilliseconds
      ) {
        this.tabs.delete(tabID);
      }
    }
    if (
      this.authoritativeTabID !== undefined
      && !this.tabs.has(this.authoritativeTabID)
    ) {
      this.promoteAuthoritativeSource();
    }
    return previousAuthoritativeTabID !== this.authoritativeTabID;
  }

  get sourceTabID(): number | undefined {
    return this.authoritativeTabID;
  }

  get snapshot(): YouTubeMusicSnapshotV0 | undefined {
    return this.authoritativeEntry?.snapshot;
  }

  state(nowUnixMs = Date.now()): YouTubeMusicBridgeStateV0 {
    this.expire(nowUnixMs);
    return this.bridgeState(this.snapshot);
  }

  snapshotForTab(tabID: number, nowUnixMs = Date.now()): YouTubeMusicSnapshotV0 | undefined {
    this.expire(nowUnixMs);
    return this.tabs.get(tabID)?.snapshot;
  }

  stateForTab(tabID: number, nowUnixMs = Date.now()): YouTubeMusicBridgeStateV0 {
    return this.bridgeState(this.snapshotForTab(tabID, nowUnixMs));
  }

  private get authoritativeEntry(): {
    snapshot: YouTubeMusicSnapshotV0;
    receivedAtUnixMs: number;
  } | undefined {
    return this.authoritativeTabID === undefined
      ? undefined
      : this.tabs.get(this.authoritativeTabID);
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

  private bridgeState(snapshot: YouTubeMusicSnapshotV0 | undefined): YouTubeMusicBridgeStateV0 {
    return {
      type: "youtube-music-bridge-state",
      connected: snapshot !== undefined,
      ...(snapshot ? { snapshot } : {}),
    };
  }
}
