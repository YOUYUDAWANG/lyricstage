import { isYouTubeMusicSnapshotV0, youtubeMusicCompanionVersion, type YouTubeMusicSnapshotV0 } from "./protocol";
import type { BrowserSourceAdapterV1 } from "./source";

export const youtubeMusicSourceAdapterV0: BrowserSourceAdapterV1<YouTubeMusicSnapshotV0> = {
  provider: "youtubeMusic",
  snapshotVersion: youtubeMusicCompanionVersion,
  isSnapshot: isYouTubeMusicSnapshotV0,
};
