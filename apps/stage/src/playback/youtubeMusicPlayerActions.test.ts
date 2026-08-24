import { describe, expect, it, vi } from "vitest";
import { createYouTubeMusicPlayerActions } from "./youtubeMusicPlayerActions";

describe("YouTube Music player actions", () => {
  it("routes like and queue commands with the gesture-time track identity", async () => {
    const setLiked = vi.fn(async () => true);
    const selectQueueItem = vi.fn(async () => true);
    const notify = vi.fn();
    const actions = createYouTubeMusicPlayerActions({
      expectedTrackID: "track-a",
      setLiked,
      selectQueueItem,
      setVolume: vi.fn(async () => true),
      setMode: vi.fn(async () => true),
      notify,
    });
    await actions.setStageLiked(true);
    await actions.selectStageQueueItem("track-b", 1);
    expect(setLiked).toHaveBeenCalledWith(true, "track-a");
    expect(selectQueueItem).toHaveBeenCalledWith("track-b", 1, "track-a");
    expect(notify).not.toHaveBeenCalled();
  });

  it("fails closed when there is no current track", async () => {
    const notify = vi.fn();
    const actions = createYouTubeMusicPlayerActions({
      setLiked: vi.fn(async () => true),
      selectQueueItem: vi.fn(async () => true),
      setVolume: vi.fn(async () => true),
      setMode: vi.fn(async () => true),
      notify,
    });
    await actions.setStageLiked(true);
    await actions.selectStageQueueItem("track-b", 1);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
