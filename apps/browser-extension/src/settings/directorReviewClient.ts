import { settingsChrome, type SettingsChrome } from "./settingsClient";
import { directorReviewStateFromResponseV1, type DirectorReviewStateV1 } from "./directorReviewModel";

export const loadDirectorCacheSummariesV1 = async (
  chromeAPI: SettingsChrome | undefined = settingsChrome(),
): Promise<DirectorReviewStateV1> => {
  if (!chromeAPI) return { status: "error", summaries: [], reason: "扩展运行时不可用" };
  try {
    return directorReviewStateFromResponseV1(await chromeAPI.runtime.sendMessage({
      type: "youtube-music-director-cache-summaries-v1",
    }));
  } catch {
    return { status: "error", summaries: [], reason: "读取审片摘要失败" };
  }
};
