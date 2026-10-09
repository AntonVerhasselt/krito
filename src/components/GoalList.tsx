"use client";
import type { CSSProperties } from "react";
import { SourceMarkup } from "./SourceMarkup";
import { StatusIcon } from "./SiteHeader";

export type Verdict = "covered" | "partial" | "not_found" | "uncertain";
export type ListGoal = {
  goalId: string;
  wording: string;
  clarification?: string;
  sourceUrl?: string;
  /** Absent while the goal is still being checked, including a recheck. */
  result?: {
    status: Verdict;
    confidence: number;
    confidenceReason: string;
    explanation: string;
    evidence: {
      fileId: string;
      page: number;
      kind: "text" | "visual";
      quote: string | null;
      description: string;
    }[];
    missingRequirements: string[];
  } | null;
  modelUsed?: string | null;
  needsReview?: boolean;
  reviewReason?: string | null;
};
export type Phase = "queued" | "preparing" | "checking" | "rechecking" | "completed";

export const verdicts: Record<Verdict, string> = {
  covered: "Gedekt",
  partial: "Gedeeltelijk gedekt",
  not_found: "Niet gevonden",
  uncertain: "Onzeker",
};
const order = Object.keys(verdicts) as Verdict[];

function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M6 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Summary({
  goals,
  total,
  phase,
  recheck,
}: {
  goals: ListGoal[];
  total: number;
  phase: Phase;
  recheck: { done: number; total: number };
}) {
  const done = phase === "completed";
  const counts = Object.fromEntries(
    order.map((k) => [k, goals.filter((g) => g.result?.status === k).length]),
  ) as Record<Verdict, number>;
  const settled = order.reduce((n, k) => n + counts[k], 0);
  const review = goals.filter((g) => g.needsReview).length;
  const headline = done
    ? `${settled} ${settled === 1 ? "leerdoel" : "leerdoelen"} beoordeeld`
    : phase === "rechecking"
      ? `Twijfelgevallen worden opnieuw gecontroleerd (${recheck.done} van ${recheck.total})`
      : phase === "checking"
        ? `${total} leerdoelen worden naast je materiaal gelegd`
        : "Je pdf’s worden voorbereid";
  return (
    <section className="results-summary" aria-label="Samenvatting">
      <div className="summary-head">
        {!done && <StatusIcon status="loading" size={22} />}
        <p className="summary-title" role={done ? undefined : "status"}>
          {headline}
        </p>
        {!done && (
          <span className="summary-hint">
            Je kunt dit tabblad open laten; de resultaten verschijnen vanzelf.
          </span>
        )}
      </div>
      <div
        className="summary-bar"
        role="img"
        aria-label={order.map((k) => `${counts[k]} ${verdicts[k].toLowerCase()}`).join(", ")}
      >
        {order.map((k) =>
          counts[k] ? (
            <span
              key={k}
              className={`bar-${k}`}
              style={{ flexGrow: counts[k] } as CSSProperties}
            />
          ) : null,
        )}
        {total > settled && (
          <span className="bar-pending" style={{ flexGrow: total - settled }} />
        )}
      </div>
      <ul className="summary-legend">
        {order.map((k) => (
          <li key={k} className={counts[k] ? "" : "is-zero"}>
            <StatusIcon status={k} size={22} />
            <strong>{counts[k]}</strong> {verdicts[k].toLowerCase()}
          </li>
        ))}
        {review > 0 && (
          <li className="legend-review">
            <strong>{review}</strong> om zelf na te kijken
          </li>
        )}
      </ul>
    </section>
  );
}

function Confidence({ value }: { value: number }) {
  return (
    <div className="confidence">
      <span className="confidence-track" aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
      <span>Zekerheid van beoordeling: {value}/100</span>
    </div>
  );
}

export function GoalList({
  goals,
  total = goals.length,
  phase,
  recheck = { done: 0, total: 0 },
  files = [],
  onOpenPdf,
}: {
  goals: ListGoal[];
  total?: number;
  phase: Phase;
  recheck?: { done: number; total: number };
  files?: { fileId: string; name: string }[];
  onOpenPdf?: (fileId: string, page: number) => void;
}) {
  return (
    <>
      <Summary goals={goals} total={total} phase={phase} recheck={recheck} />
      <ol className="goal-rows" aria-label="Leerdoelen">
        {goals.map((g, i) => {
          const r = g.result;
          const style = { "--i": i } as CSSProperties;
          const head = (
            <>
              <span className="goal-row-icon">
                {r ? (
                  <span className="verdict-mark" key={r.status}>
                    <StatusIcon status={r.status} size={34} />
                  </span>
                ) : (
                  <StatusIcon status="loading" size={34} />
                )}
              </span>
              <span className="goal-row-text">
                <span className="goal-code">{g.goalId}</span>
                <span className="goal-wording">
                  <SourceMarkup html={g.wording} />
                </span>
              </span>
              <span className="goal-row-state">
                {r ? (
                  <>
                    <span className={`verdict verdict-${r.status}`}>
                      {verdicts[r.status]}
                    </span>
                    {g.needsReview && (
                      <span className="review-flag">Kijk zelf na</span>
                    )}
                  </>
                ) : (
                  <span className="pending-label">
                    {phase === "rechecking" ? "Tweede controle" : "Wordt nagekeken"}
                  </span>
                )}
              </span>
            </>
          );
          if (!r)
            return (
              <li key={g.goalId} className="goal-row is-pending" style={style}>
                <div className="goal-row-head">
                  {head}
                  <span className="chevron-space" />
                </div>
              </li>
            );
          return (
            <li key={g.goalId} className="goal-row" style={style}>
              <details className={`result-card note-${r.status}`}>
                <summary className="goal-row-head">
                  {head}
                  <svg
                    className="chevron"
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="m5 8 5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <div className="result-detail">
                  <div className="detail-col">
                    <h3>Beoordeling</h3>
                    <p className="explanation">{r.explanation}</p>
                    <Confidence value={r.confidence} />
                    <p className="confidence-reason">{r.confidenceReason}</p>
                    {g.needsReview && (
                      <p className="review-note">
                        {g.reviewReason === "recheck_failed"
                          ? "De tweede controle is mislukt. De oorspronkelijke beoordeling blijft bewaard; kijk dit doel zelf na."
                          : "Ook na de tweede controle blijft de beoordeling onzeker. Kijk dit doel zelf na."}
                      </p>
                    )}
                    {r.missingRequirements.length > 0 && (
                      <div className="missing">
                        <h4>Wat ontbreekt</h4>
                        <ul>
                          {r.missingRequirements.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="detail-col evidence-list">
                    <h3>Bewijs uit je materiaal</h3>
                    {r.evidence.length ? (
                      <>
                        <p className="field-hint">
                          Deze verwijzingen en citaten zijn door het model
                          gemaakt. Controleer ze in de pdf.
                        </p>
                        {r.evidence.map((e, i) => (
                          <div className="evidence" key={i}>
                            <button
                              type="button"
                              className="page-link"
                              onClick={() => onOpenPdf?.(e.fileId, e.page)}
                            >
                              <span className="page-link-name">
                                {files.find((f) => f.fileId === e.fileId)?.name}
                              </span>
                              <span className="page-link-page">
                                pagina {e.page} <ExternalIcon />
                              </span>
                            </button>
                            {e.kind === "text" && e.quote && (
                              <blockquote>{e.quote}</blockquote>
                            )}
                            {e.description && <p>{e.description}</p>}
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="field-hint">
                        Er werd geen passage in je materiaal gevonden voor dit
                        doel.
                      </p>
                    )}
                  </div>
                  <div className="result-source">
                    <span>
                      {g.modelUsed === "gpt-6.1-sol"
                        ? "Onafhankelijk opnieuw gecontroleerd met Sol"
                        : "Beoordeling met Luna"}
                    </span>
                    {g.sourceUrl && (
                      <a href={g.sourceUrl} target="_blank" rel="noreferrer">
                        Officiële bron <ExternalIcon />
                      </a>
                    )}
                  </div>
                  {g.clarification && (
                    <details className="clarification">
                      <summary>Officiële toelichting</summary>
                      <div className="source-clarification">
                        <SourceMarkup html={g.clarification} />
                      </div>
                    </details>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </>
  );
}
