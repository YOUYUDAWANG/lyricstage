import { SourceRegistryV1 } from "./source";
import { youtubeMusicSourceAdapterV0 } from "./youtubeMusicSource";
import type { YouTubeMusicBridgeStateV0, YouTubeMusicSnapshotV0 } from "./protocol";

export class YouTubeMusicSourceRegistryV0 {
  static readonly leaseMilliseconds = 3000;
  private readonly registry = new SourceRegistryV1(
    youtubeMusicSourceAdapterV0,
    YouTubeMusicSourceRegistryV0.leaseMilliseconds,
  );

  accept(tabID: number | undefined, value: unknown, receivedAtUnixMs = Date.now()): boolean {
    return this.registry.accept(tabID, value, receivedAtUnixMs);
  }

  remove(tabID: number): boolean {
    return this.registry.remove(tabID);
  }

  expire(nowUnixMs = Date.now()): boolean {
    return this.registry.expire(nowUnixMs);
  }

  get sourceTabID(): number | undefined {
    return this.registry.sourceTabID;
  }

  get snapshot(): YouTubeMusicSnapshotV0 | undefined {
    return this.registry.snapshot;
  }

  state(nowUnixMs = Date.now()): YouTubeMusicBridgeStateV0 {
    this.registry.expire(nowUnixMs);
    return this.bridgeState(this.registry.snapshot);
  }

  snapshotForTab(tabID: number, nowUnixMs = Date.now()): YouTubeMusicSnapshotV0 | undefined {
    return this.registry.snapshotForTab(tabID, nowUnixMs);
  }

  stateForTab(tabID: number, nowUnixMs = Date.now()): YouTubeMusicBridgeStateV0 {
    return this.bridgeState(this.registry.snapshotForTab(tabID, nowUnixMs));
  }

  private bridgeState(snapshot: YouTubeMusicSnapshotV0 | undefined): YouTubeMusicBridgeStateV0 {
    return {
      type: "youtube-music-bridge-state",
      connected: snapshot !== undefined,
      ...(snapshot ? { snapshot } : {}),
    };
  }
}
