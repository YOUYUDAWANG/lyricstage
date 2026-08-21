import {
  isYouTubeMusicSnapshotV0,
  type YouTubeMusicBridgeStateV0,
  type YouTubeMusicSnapshotV0,
} from "./protocol";

export class YouTubeMusicSourceRegistryV0 {
  static readonly leaseMilliseconds = 3000;
  private current?: { tabID: number; snapshot: YouTubeMusicSnapshotV0 };

  accept(tabID: number | undefined, value: unknown, nowUnixMs = Date.now()): boolean {
    if (tabID === undefined || !isYouTubeMusicSnapshotV0(value)) return false;
    if (!this.current) {
      this.current = { tabID, snapshot: value };
      return true;
    }

    if (this.current.tabID === tabID) {
      if (
        value.sentAtUnixMs < this.current.snapshot.sentAtUnixMs ||
        (
          value.sentAtUnixMs === this.current.snapshot.sentAtUnixMs &&
          value.sequence <= this.current.snapshot.sequence
        )
      ) {
        return false;
      }
      this.current = { tabID, snapshot: value };
      return true;
    }

    const currentIsPlaying = this.current.snapshot.playback.state === "playing";
    const candidateIsPlaying = value.playback.state === "playing";
    const currentIsStale =
      nowUnixMs - this.current.snapshot.sentAtUnixMs > YouTubeMusicSourceRegistryV0.leaseMilliseconds;
    if ((!currentIsPlaying && candidateIsPlaying) || currentIsStale) {
      this.current = { tabID, snapshot: value };
      return true;
    }
    return false;
  }

  remove(tabID: number): boolean {
    if (this.current?.tabID !== tabID) return false;
    this.current = undefined;
    return true;
  }

  expire(nowUnixMs = Date.now()): boolean {
    if (
      !this.current ||
      nowUnixMs - this.current.snapshot.sentAtUnixMs <= YouTubeMusicSourceRegistryV0.leaseMilliseconds
    ) return false;
    this.current = undefined;
    return true;
  }

  get sourceTabID(): number | undefined {
    return this.current?.tabID;
  }

  get snapshot(): YouTubeMusicSnapshotV0 | undefined {
    return this.current?.snapshot;
  }

  state(nowUnixMs = Date.now()): YouTubeMusicBridgeStateV0 {
    this.expire(nowUnixMs);
    return {
      type: "youtube-music-bridge-state",
      connected: this.current !== undefined,
      ...(this.current ? { snapshot: this.current.snapshot } : {}),
    };
  }
}
