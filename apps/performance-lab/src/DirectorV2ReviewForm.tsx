import {
  directorV2ReviewDimensionsV1,
  type DirectorV2RecallReviewV1,
  type DirectorV2ReviewDimensionIDV1,
  type DirectorV2ReviewMarkV1,
  type DirectorV2ReviewScoreV1,
  type DirectorV2VariantReviewV1,
} from "@lyricstage/performance";

const recallQuestions = [
  ["motif", "贯穿演出的视觉母题是什么？"],
  ["eventOne", "记得的第一个具体事件"],
  ["eventTwo", "记得的第二个具体事件"],
  ["returnOrResolution", "哪个变化后来重新出现或得到解决？"],
  ["chorusDifference", "后一次副歌与第一次有什么真正不同？"],
  ["restrainedSegment", "哪一段最克制？"],
  ["wrongPositionAction", "哪个动作让你觉得发生在错误位置？没有则写“无”。"],
] as const satisfies readonly [keyof DirectorV2RecallReviewV1, string][];

const ReviewMark = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DirectorV2ReviewMarkV1;
  onChange: (value: DirectorV2ReviewMarkV1) => void;
}) => (
  <label className="director-v2-review-mark">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as DirectorV2ReviewMarkV1)}>
      <option value="unrated">未确认</option>
      <option value="pass">能复述</option>
      <option value="fail">不能复述</option>
    </select>
  </label>
);

export function DirectorV2ReviewForm({
  blindLabel,
  review,
  fullPlayComplete,
  onChange,
}: {
  blindLabel: string;
  review: DirectorV2VariantReviewV1;
  fullPlayComplete: boolean;
  onChange: (review: DirectorV2VariantReviewV1) => void;
}) {
  const updateScore = (dimension: DirectorV2ReviewDimensionIDV1, rawValue: string) => {
    const scores = { ...review.scores };
    if (rawValue === "") delete scores[dimension];
    else scores[dimension] = Number(rawValue) as DirectorV2ReviewScoreV1;
    onChange({ ...review, scores });
  };
  const updateRecall = <K extends keyof DirectorV2RecallReviewV1>(
    key: K,
    value: DirectorV2RecallReviewV1[K],
  ) => onChange({ ...review, recall: { ...review.recall, [key]: value } });

  return (
    <section className="director-v2-version-review" aria-disabled={!fullPlayComplete}>
      <header>
        <div>
          <span>VERSION {blindLabel}</span>
          <strong>{fullPlayComplete ? "完整播放已记录" : "先从 0:00 完整播放到结尾"}</strong>
        </div>
        <small>评分在完整播放后解锁；5 分始终代表更好的结果。</small>
      </header>
      <fieldset disabled={!fullPlayComplete}>
        <legend>1–5 分</legend>
        <div className="director-v2-score-grid">
          {directorV2ReviewDimensionsV1.map(({ id, label, question }) => (
            <label key={id}>
              <span><b>{label}</b><small>{question}</small></span>
              <select value={review.scores[id] ?? ""} onChange={(event) => updateScore(id, event.target.value)}>
                <option value="">未评</option>
                {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="director-v2-recall-grid">
          <h3>观看后即时回忆</h3>
          <p>先不要回放或打开时间线；写具体形态和事件，不写“很好看”“粒子很多”。</p>
          {recallQuestions.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <textarea
                rows={2}
                value={String(review.recall[key])}
                onChange={(event) => updateRecall(key, event.target.value as DirectorV2RecallReviewV1[typeof key])}
              />
            </label>
          ))}
          <div className="director-v2-recall-marks">
            <ReviewMark
              label="母题是否可被具体复述？"
              value={review.recall.motifConfirmed}
              onChange={(value) => updateRecall("motifConfirmed", value)}
            />
            <ReviewMark
              label="是否确实记住两个不同事件？"
              value={review.recall.twoEventsConfirmed}
              onChange={(value) => updateRecall("twoEventsConfirmed", value)}
            />
          </div>
        </div>
      </fieldset>
    </section>
  );
}
