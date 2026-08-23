import { useEffect, useMemo, useState } from "react";
import {
  createDirectorV2GateReportV1,
  createDirectorV2CombinedGateReportV1,
  createEmptyDirectorV2ArtGateReviewV1,
  directorV2HardGatesV1,
  directorV2LocalizedFailureCausesV1,
  isDirectorV2GateReportV1,
  type DirectorV2ArtGateReviewV1,
  type DirectorV2BlindLabelV1,
  type DirectorV2BlindReviewSessionV1,
  type DirectorV2ExperimentPackV1,
  type DirectorV2ExperimentVariantID,
  type DirectorV2FixtureReviewV1,
  type DirectorV2HardGateStatusV1,
  type DirectorV2GateReportV1,
  type DirectorV2ReviewMarkV1,
} from "@lyricstage/performance";
import { DirectorV2ReviewForm } from "./DirectorV2ReviewForm";

const markOptions = (
  <>
    <option value="unrated">未评</option>
    <option value="pass">通过</option>
    <option value="fail">失败</option>
  </>
);

const resultLabel = (value: boolean | null): string => value === null ? "—" : value ? "是" : "否";

const verdictLabel = (value: string): string => ({
  pass: "通过",
  conditional: "局部失败",
  fail: "失败",
  "awaiting-review": "待评",
}[value] ?? value);

const reviewStorageKey = (session: DirectorV2BlindReviewSessionV1): string =>
  `lyricstage:${session.reviewerSeed}:art-gate-review`;

const loadReview = (session: DirectorV2BlindReviewSessionV1): DirectorV2ArtGateReviewV1 => {
  const empty = createEmptyDirectorV2ArtGateReviewV1(session.fixtureOrder, session.reviewerID);
  try {
    const raw = localStorage.getItem(reviewStorageKey(session));
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<DirectorV2ArtGateReviewV1>;
    if (saved.version !== session.version
      || saved.candidateCommit !== session.candidateCommit
      || saved.reviewerID !== session.reviewerID
      || !saved.fixtures
      || !saved.hardGates) return empty;
    return saved as DirectorV2ArtGateReviewV1;
  } catch {
    return empty;
  }
};

export function DirectorV2GatePanel({
  session,
  experiment,
  fixtureLabels,
  activeVariantID,
  fullPlayCompleted,
  timeMs,
  grayscale,
  onReviewerIDChange,
  onSelectFixture,
  onSelectVariant,
  onGrayscaleChange,
  onResetSession,
}: {
  session: DirectorV2BlindReviewSessionV1;
  experiment: DirectorV2ExperimentPackV1;
  fixtureLabels: Readonly<Record<string, string>>;
  activeVariantID: DirectorV2ExperimentVariantID;
  fullPlayCompleted: Readonly<Record<string, boolean>>;
  timeMs: number;
  grayscale: boolean;
  onReviewerIDChange: (reviewerID: string) => void;
  onSelectFixture: (fixtureID: string) => void;
  onSelectVariant: (variantID: DirectorV2ExperimentVariantID) => void;
  onGrayscaleChange: (grayscale: boolean) => void;
  onResetSession: () => void;
}) {
  const [reviewerDraft, setReviewerDraft] = useState(session.reviewerID);
  const [review, setReview] = useState<DirectorV2ArtGateReviewV1>(() => loadReview(session));
  const [commentDraft, setCommentDraft] = useState("");
  const [commentKind, setCommentKind] = useState<"comment" | "anomaly">("comment");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [resetArmed, setResetArmed] = useState(false);
  const [otherReportText, setOtherReportText] = useState("");
  const [otherReport, setOtherReport] = useState<DirectorV2GateReportV1 | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const assignment = session.assignments.find((candidate) => candidate.fixtureID === experiment.fixtureID)!;
  const blindLabel = assignment.labelByVariant[activeVariantID];
  const fixtureReview = review.fixtures[experiment.fixtureID]!;
  const activeReview = fixtureReview.variants[activeVariantID];
  const fullPlayKey = `${experiment.fixtureID}:${activeVariantID}`;
  const allFullPlays = (["A", "B", "C", "D"] as const)
    .every((variantID) => fullPlayCompleted[`${experiment.fixtureID}:${variantID}`]);
  const report = useMemo(() => createDirectorV2GateReportV1(session, review), [review, session]);
  const combinedReport = useMemo(
    () => createDirectorV2CombinedGateReportV1(otherReport ? [report, otherReport] : [report]),
    [otherReport, report],
  );
  const reviewRowsComplete = report.rows.every(({ verdict }) => verdict !== "awaiting-review");

  useEffect(() => {
    localStorage.setItem(reviewStorageKey(session), JSON.stringify(review));
  }, [review, session]);

  const updateFixture = (update: (fixture: DirectorV2FixtureReviewV1) => DirectorV2FixtureReviewV1) => {
    setReview((current) => ({
      ...current,
      fixtures: {
        ...current.fixtures,
        [experiment.fixtureID]: update(current.fixtures[experiment.fixtureID]!),
      },
    }));
  };

  const updateSpecialMark = (
    key: "grayscaleDistinct" | "chorusEscalationAndResolution" | "instrumentalGapAlive",
    value: DirectorV2ReviewMarkV1,
  ) => updateFixture((fixture) => ({ ...fixture, [key]: value }));

  const comparisonControl = (
    key: keyof DirectorV2FixtureReviewV1["comparisons"],
    left: DirectorV2ExperimentVariantID,
    right: DirectorV2ExperimentVariantID,
    question: string,
  ) => {
    const labels = assignment.playbackOrder.filter((label) => {
      const variant = assignment.variantByLabel[label];
      return variant === left || variant === right;
    });
    return (
      <label>
        <span>{question}<small>只比较 Version {labels.join(" 与 Version ")}，角色仍保持隐藏。</small></span>
        <select
          disabled={!allFullPlays}
          value={fixtureReview.comparisons[key]}
          onChange={(event) => updateFixture((fixture) => ({
            ...fixture,
            comparisons: { ...fixture.comparisons, [key]: event.target.value as DirectorV2BlindLabelV1 | "same" | "unrated" },
          }))}
        >
          <option value="unrated">未评</option>
          {labels.map((label) => <option key={label} value={label}>Version {label}</option>)}
          <option value="same">无明显差异</option>
        </select>
      </label>
    );
  };

  const addComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    updateFixture((fixture) => ({
      ...fixture,
      comments: [...fixture.comments, {
        id: `${fixture.fixtureID}:${fixture.comments.length + 1}`,
        variantID: activeVariantID,
        timeMs: Math.round(timeMs),
        kind: commentKind,
        text,
      }],
    }));
    setCommentDraft("");
  };

  const copyFacilitatorReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ session, review, report }, null, 2));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const resetSession = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    localStorage.removeItem(reviewStorageKey(session));
    setReview(createEmptyDirectorV2ArtGateReviewV1(session.fixtureOrder, session.reviewerID));
    onResetSession();
    setResetArmed(false);
  };

  const importOtherReport = () => {
    try {
      const parsed = JSON.parse(otherReportText) as unknown;
      const candidate = parsed && typeof parsed === "object" && "report" in parsed
        ? (parsed as { report: unknown }).report
        : parsed;
      if (!isDirectorV2GateReportV1(candidate)) throw new Error("不是同一候选版本的 Director V2 Gate Report");
      if (candidate.reviewerID === report.reviewerID) throw new Error("需要不同 reviewer code 的独立报告");
      setOtherReport(candidate);
      setImportError(null);
    } catch (error) {
      setOtherReport(null);
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="director-v2-gate" data-gate-status={report.artGate}>
      <header>
        <div>
          <span>DIRECTOR V2 / CONTROLLED ART GATE</span>
          <strong>{report.artGate}</strong>
        </div>
        <small>候选 {session.candidateCommit} 已冻结。系统只记录事实，不替观看者评分。</small>
      </header>

      <div className="director-v2-session-bar">
        <label>
          Reviewer code
          <input value={reviewerDraft} onChange={(event) => setReviewerDraft(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => onReviewerIDChange(reviewerDraft.trim() || "reviewer-1")}
          disabled={(reviewerDraft.trim() || "reviewer-1") === session.reviewerID}
        >
          开始独立随机 Session
        </button>
        <button className="director-v2-reset-session" type="button" onClick={resetSession}>
          {resetArmed ? "再次点击确认清空" : "清空当前 Session"}
        </button>
        <span>不同 code 会得到不同 fixture 顺序与盲标映射；每个 code 的记录分别保存在本机。</span>
        <span>当前 Lab 没有真实音频；正式艺术门必须用同一音轨、音量、设备和 build 同步播放。</span>
      </div>

      <nav className="director-v2-fixtures" aria-label="五首 fixture 审片顺序">
        {session.fixtureOrder.map((fixtureID, index) => {
          const row = report.rows.find((candidate) => candidate.fixtureID === fixtureID)!;
          return (
            <button
              key={fixtureID}
              type="button"
              aria-current={experiment.fixtureID === fixtureID ? "step" : undefined}
              onClick={() => onSelectFixture(fixtureID)}
            >
              <b>{index + 1}</b>
              <span>{fixtureLabels[fixtureID] ?? fixtureID}</span>
              <small>{verdictLabel(row.verdict)}</small>
            </button>
          );
        })}
      </nav>

      <div className="director-v2-review-toolbar">
        <p>每个版本必须从 0:00 完整播放到结尾；切换版本会自动归零。</p>
        <label><input type="checkbox" checked={grayscale} onChange={(event) => onGrayscaleChange(event.target.checked)} />灰度检查</label>
      </div>

      <div className="director-v2-variants" role="group" aria-label="随机盲测变体">
        {assignment.playbackOrder.map((label, index) => {
          const variantID = assignment.variantByLabel[label];
          const completed = fullPlayCompleted[`${experiment.fixtureID}:${variantID}`];
          return (
            <button
              key={label}
              type="button"
              aria-pressed={activeVariantID === variantID}
              onClick={() => onSelectVariant(variantID)}
            >
              <b>{label}</b>
              <span>Version {label}</span>
              <small>{index + 1} / 4 · {completed ? "full play ✓" : "not completed"}</small>
            </button>
          );
        })}
      </div>

      <DirectorV2ReviewForm
        blindLabel={blindLabel}
        review={activeReview}
        fullPlayComplete={Boolean(fullPlayCompleted[fullPlayKey])}
        onChange={(next) => updateFixture((fixture) => ({
          ...fixture,
          variants: { ...fixture.variants, [activeVariantID]: next },
        }))}
      />

      <section className="director-v2-comparisons">
        <h3>四个版本完整观看后的盲比较</h3>
        <p>{allFullPlays ? "已解锁比较，但仍不显示 A/B/C/D 身份。" : "完成当前 fixture 的四次完整播放后解锁。"}</p>
        <div className="director-v2-review-grid">
          {comparisonControl("bOverA", "B", "A", "哪一个更令人记住？")}
          {comparisonControl("bOverC", "B", "C", "哪一个的动作位置更有原因？")}
          {comparisonControl("bOverD", "B", "D", "哪一个更像这首歌本身？")}
          <label>
            <span>关闭颜色后，关键事件与分支仍可区分？</span>
            <select disabled={!allFullPlays} value={fixtureReview.grayscaleDistinct} onChange={(event) => updateSpecialMark("grayscaleDistinct", event.target.value as DirectorV2ReviewMarkV1)}>{markOptions}</select>
          </label>
          {experiment.fixtureID.includes("repeated-chorus") && (
            <label>
              <span>能说清一次副歌升级与一次最终回收？</span>
              <select disabled={!allFullPlays} value={fixtureReview.chorusEscalationAndResolution} onChange={(event) => updateSpecialMark("chorusEscalationAndResolution", event.target.value as DirectorV2ReviewMarkV1)}>{markOptions}</select>
            </label>
          )}
          {experiment.fixtureID.includes("slow-gap") && (
            <label>
              <span>115 秒 gap 没有“断电、屏保、页面停住”？</span>
              <select disabled={!allFullPlays} value={fixtureReview.instrumentalGapAlive} onChange={(event) => updateSpecialMark("instrumentalGapAlive", event.target.value as DirectorV2ReviewMarkV1)}>{markOptions}</select>
            </label>
          )}
          <label>
            <span>若仅此 fixture 局部失败，归因（不要用它掩盖系统性失败）</span>
            <select
              disabled={!allFullPlays}
              value={fixtureReview.localizedFailureCause ?? ""}
              onChange={(event) => updateFixture((fixture) => ({
                ...fixture,
                localizedFailureCause: event.target.value
                  ? event.target.value as DirectorV2FixtureReviewV1["localizedFailureCause"]
                  : undefined,
              }))}
            >
              <option value="">无 / 尚未归因</option>
              {directorV2LocalizedFailureCausesV1.map((cause) => <option key={cause} value={cause}>{cause}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="director-v2-comments">
        <h3>时间点评论与异常</h3>
        <div>
          <select value={commentKind} onChange={(event) => setCommentKind(event.target.value as typeof commentKind)}>
            <option value="comment">评论</option>
            <option value="anomaly">异常</option>
          </select>
          <input value={commentDraft} placeholder={`Version ${blindLabel} @ ${Math.round(timeMs)}ms`} onChange={(event) => setCommentDraft(event.target.value)} />
          <button type="button" onClick={addComment}>记录当前时间</button>
        </div>
        {fixtureReview.comments.length > 0 && (
          <ol>
            {fixtureReview.comments.map((comment) => (
              <li key={comment.id}>
                <b>{comment.kind}</b>
                <code>V{assignment.labelByVariant[comment.variantID]} · {Math.round(comment.timeMs)}ms</code>
                <span>{comment.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <details className="director-v2-hard-gates">
        <summary>工程硬门（全部通过才可能放行 AI shadow）</summary>
        <div className="director-v2-review-grid">
          {directorV2HardGatesV1.map(({ id, label }) => (
            <label key={id}>
              <span>{label}</span>
              <select
                value={review.hardGates[id]}
                onChange={(event) => setReview((current) => ({
                  ...current,
                  hardGates: { ...current.hardGates, [id]: event.target.value as DirectorV2HardGateStatusV1 },
                }))}
              >
                <option value="unverified">未验证</option>
                <option value="pass">通过</option>
                <option value="fail">失败</option>
              </select>
            </label>
          ))}
        </div>
      </details>

      {reviewRowsComplete && (
        <section className="director-v2-report">
          <header><span>FACILITATOR / UNBLINDED GATE REPORT</span><strong>{report.artGate}</strong></header>
          <table>
            <thead><tr><th>Fixture</th><th>B&gt;A</th><th>B&gt;C</th><th>B&gt;D</th><th>Motif</th><th>2 events</th><th>Readability</th><th>Gap/seek</th><th>Verdict</th></tr></thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.fixtureID}>
                  <td>{fixtureLabels[row.fixtureID] ?? row.fixtureID}</td>
                  <td>{resultLabel(row.bOverA)}</td>
                  <td>{resultLabel(row.bOverC)}</td>
                  <td>{resultLabel(row.bOverD)}</td>
                  <td>{resultLabel(row.motifRecalled)}</td>
                  <td>{resultLabel(row.twoEventsRecalled)}</td>
                  <td>{row.readability}</td>
                  <td>{row.gapSeek}</td>
                  <td>{verdictLabel(row.verdict)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="director-v2-report-summary">
            <strong>本 reviewer Art Gate: {report.artGate}</strong>
            <strong>WindowIntentV2 AI Shadow: {report.aiShadow}（单人报告不能放行）</strong>
            <span>B&gt;A {report.counts.bOverA}/5 · B&gt;C {report.counts.bOverC}/5 · B&gt;D {report.counts.bOverD}/5 · Recall {report.counts.recall}/5</span>
          </div>
          {report.requiredFixes.length > 0 && <ul>{report.requiredFixes.map((fix) => <li key={fix}>{fix}</li>)}</ul>}
          <button type="button" onClick={copyFacilitatorReport}>复制完整 JSON（含解盲映射）</button>
          <small>{copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "仅供主持人在评分完成后保存"}</small>
          <div className="director-v2-combine-report">
            <label>
              第二位 reviewer 的完整 JSON
              <textarea rows={4} value={otherReportText} onChange={(event) => setOtherReportText(event.target.value)} />
            </label>
            <button type="button" onClick={importOtherReport}>合并独立报告</button>
            {importError && <small>{importError}</small>}
            {otherReport && (
              <div>
                <strong>Combined Art Gate: {combinedReport.artGate}</strong>
                <strong>WindowIntentV2 AI Shadow: {combinedReport.aiShadow}</strong>
                <span>Reviewers: {combinedReport.reviewerIDs.join(" + ")}</span>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
