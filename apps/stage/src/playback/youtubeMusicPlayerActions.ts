interface YouTubeMusicPlayerActionsOptions {
  expectedTrackID?: string;
  setLiked(liked: boolean, expectedTrackID: string): Promise<boolean>;
  selectQueueItem(queueTrackID: string, queueIndex: number, expectedTrackID: string): Promise<boolean>;
  setMode(expectedTrackID: string, mode: "shuffle" | "repeat", value: boolean | "off" | "all" | "one"): Promise<boolean>;
  notify(message: string): void;
}

export const createYouTubeMusicPlayerActions = ({
  expectedTrackID,
  setLiked,
  selectQueueItem,
  setMode,
  notify,
}: YouTubeMusicPlayerActionsOptions) => ({
  async setStageLiked(liked: boolean) {
    const ok = expectedTrackID ? await setLiked(liked, expectedTrackID) : false;
    if (!ok) notify("点赞操作暂时不可用：歌曲可能刚刚切换，请重试。");
  },
  async selectStageQueueItem(queueTrackID: string, queueIndex: number) {
    const ok = expectedTrackID
      ? await selectQueueItem(queueTrackID, queueIndex, expectedTrackID)
      : false;
    if (!ok) notify("播放列表已变化，请重新打开后再选择。");
  },
  async setStagePlaybackMode(mode: "shuffle" | "repeat", value: boolean | "off" | "all" | "one") {
    const ok = expectedTrackID ? await setMode(expectedTrackID, mode, value) : false;
    if (!ok) notify("播放模式暂时不可用。");
  },
});
