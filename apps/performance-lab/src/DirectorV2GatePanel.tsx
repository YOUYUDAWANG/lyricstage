import { useState } from "react";
import type {
  DirectorV2ExperimentPackV1,
  DirectorV2ExperimentVariantID,
} from "@lyricstage/performance";

type ReviewValue = "unrated" | "pass" | "fail";

const reviewCriteria = [
  ["incremental", "B 是否比 A 更令人记住"],
  ["causality", "B 是否比 C 更有语义因果"],
  ["difference", "B 是否比 D 更像这首歌"],
  ["readability", "B 的歌词可读性是否不低于 A"],
  ["gap", "器乐空白段是否仍然有生命和视觉债务"],
  ["recipe", "Recipe 是否不靠颜色也能辨认"],
  ["silhouette", "同一 Recipe 在不同歌曲是否有不同空间轮廓"],
] as const;

export function DirectorV2GatePanel({
  experiment,
  activeVariantID,
  onSelectVariant,
}: {
  experiment: DirectorV2ExperimentPackV1;
  activeVariantID: DirectorV2ExperimentVariantID;
  onSelectVariant: (variant: DirectorV2ExperimentVariantID) => void;
}) {
  const [reviews, setReviews] = useState<Record<string, ReviewValue>>(() =>
    Object.fromEntries(reviewCriteria.map(([id]) => [id, "unrated"])),
  );
  const values = Object.values(reviews);
  const gateStatus = values.includes("fail") ? "failed" : values.every((value) => value === "pass") ? "passed" : "awaiting-review";
  const active = experiment.variants.find((variant) => variant.id === activeVariantID)!;

  return (
    <section className="director-v2-gate" data-gate-status={gateStatus}>
      <header>
        <div>
          <span>DIRECTOR V2 / EXPRESSION GATE</span>
          <strong>{gateStatus}</strong>
        </div>
        <small>评分只保存在当前页面；系统不会替审片人宣布通过。</small>
      </header>
      <div className="director-v2-variants" role="group" aria-label="A/B/C/D 变体">
        {experiment.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={activeVariantID === variant.id}
            onClick={() => onSelectVariant(variant.id)}
          >
            <b>{variant.id}</b>
            <span>{variant.label}</span>
            <small>{variant.metrics.recipeEventCount} events · {variant.metrics.promiseCount} promises</small>
          </button>
        ))}
      </div>
      <div className="director-v2-active-facts">
        <span>branch</span><code>{active.metrics.branchSignature}</code>
        <span>primitive</span><code>{active.metrics.primitiveSignature}</code>
        <span>unresolved</span><code>{active.metrics.unresolvedPromiseCount}</code>
      </div>
      <div className="director-v2-review-grid">
        {reviewCriteria.map(([id, label]) => (
          <label key={id}>
            <span>{label}</span>
            <select
              value={reviews[id]}
              onChange={(event) => setReviews((current) => ({ ...current, [id]: event.target.value as ReviewValue }))}
            >
              <option value="unrated">未评</option>
              <option value="pass">通过</option>
              <option value="fail">失败</option>
            </select>
          </label>
        ))}
      </div>
      <p>pause / seek / hidden-resume 的基础数值一致性由自动测试负责；这里仅记录艺术判断。</p>
    </section>
  );
}
