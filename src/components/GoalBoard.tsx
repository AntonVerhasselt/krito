"use client";
import { useState, type CSSProperties } from "react";
import { SourceMarkup } from "./SourceMarkup";
import { StatusIcon } from "./SiteHeader";

export type Verdict = "covered" | "partial" | "not_found" | "uncertain";
export type BoardGoal = {
  goalId: string;
  wording: string;
  clarification?: string;
  sourceUrl?: string;
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
  };
  modelUsed?: string;
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
const tilts = [-1.4, 0.9, -0.5, 1.6, -1, 0.4, 1.2, -1.7];
const pins = ["blue", "coral", "amber"];

function Tally({ count }: { count: number }) {
  const marks = Math.min(count, 20);
  const groups = Array.from({ length: Math.ceil(marks / 5) }, (_, g) =>
    Math.min(5, marks - g * 5),
  );
  return (
    <svg
      className="tally"
      viewBox={`0 0 ${Math.max(groups.length, 1) * 34} 30`}
      width={Math.max(groups.length, 1) * 34}
      height={30}
      aria-hidden="true"
    >
      {groups.map((n, g) =>
        Array.from({ length: n }, (_, i) => (
          <path
            key={`${g}-${i}`}
            pathLength={1}
            style={{ "--d": `${(g * 5 + i) * 70 + 300}ms` } as CSSProperties}
            d={
              i === 4
                ? `M${g * 34 + 1} 22 L${g * 34 + 27} 8`
                : `M${g * 34 + 4 + i * 6} 4 L${g * 34 + 3 + i * 6} 26`
            }
          />
        )),
      )}
    </svg>
  );
}

function Steps({
  phase,
  recheck,
}: {
  phase: Phase;
  recheck: { done: number; total: number };
}) {
  const order: Phase[] = ["preparing", "checking", "rechecking", "completed"];
  const at = order.indexOf(phase === "queued" ? "preparing" : phase);
  const steps = [
    { label: "Pdf’s voorbereiden", phase: "preparing" },
    { label: "Leerdoelen nakijken", phase: "checking" },
    {
      label:
        phase === "rechecking"
          ? `Twijfels dubbelchecken (${recheck.done} van ${recheck.total})`
          : "Twijfels dubbelchecken",
      phase: "rechecking",
    },
  ] as const;
  return (
    <ol className="board-steps" aria-label="Voortgang">
      {steps.map((s, i) => {
        const idx = order.indexOf(s.phase);
        const state = idx < at ? "done" : idx === at ? "current" : "todo";
        return (
          <li
            key={s.phase}
            className={`board-step is-${state}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "done" ? (
              <StatusIcon status="covered" size={26} />
            ) : state === "current" ? (
              <StatusIcon status="loading" size={26} />
            ) : (
              <span className="step-dot">{i + 1}</span>
            )}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function Confidence({ value }: { value: number }) {
  const filled = Math.round(value / 10);
  return (
    <span className="confidence">
      <span className="confidence-marks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className={i < filled ? "on" : ""} />
        ))}
      </span>
      Zekerheid van beoordeling: {value}/100
    </span>
  );
}

export function GoalBoard({
  goals,
  extra = 0,
  phase,
  recheck = { done: 0, total: 0 },
  files = [],
  onOpenPdf,
}: {
  goals: BoardGoal[];
  extra?: number;
  phase: Phase;
  recheck?: { done: number; total: number };
  files?: { fileId: string; name: string }[];
  onOpenPdf?: (fileId: string, page: number) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const done = phase === "completed";
  const counts = Object.fromEntries(
    (Object.keys(verdicts) as Verdict[]).map((key) => [
      key,
      goals.filter((g) => g.result?.status === key).length,
    ]),
  ) as Record<Verdict, number>;
  const review = goals.filter((g) => g.needsReview).length;
  const rows = goals
    .map((g, index) => ({ g, index }))
    .filter(
      ({ g }) =>
        !done ||
        filter === "all" ||
        (filter === "review" ? g.needsReview : g.result?.status === filter),
    );

  return (
    <section
      className={`checkboard${done ? " is-done" : " is-working"}`}
      aria-label="Leerdoelen op het bord"
    >
      <div className="checkboard-frame">
        <div className="checkboard-surface">
          <div className="checkboard-head">
            {done ? (
              <div className="results-summary">
                {(Object.keys(verdicts) as Verdict[]).map((key) => (
                  <div key={key} className={`tally-cell tally-${key}`}>
                    <StatusIcon status={key} size={36} />
                    <strong>{counts[key]}</strong>
                    <span className="tally-label">{verdicts[key]}</span>
                    <Tally count={counts[key]} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="chalk-heading" role="status">
                  {phase === "rechecking"
                    ? "Krito kijkt een paar twijfelgevallen opnieuw na…"
                    : phase === "checking"
                      ? "Krito legt elk leerdoel naast je materiaal…"
                      : "Krito legt je pdf’s klaar…"}
                </p>
                <Steps phase={phase} recheck={recheck} />
              </>
            )}
          </div>
          <div className="note-grid">
            {rows.map(({ g, index }) => {
              const style = {
                "--r": `${tilts[index % tilts.length]}deg`,
                "--i": index,
              } as CSSProperties;
              const pin = `pin-${pins[index % pins.length]}`;
              if (!g.result)
                return (
                  <article
                    key={g.goalId}
                    className={`note is-pending ${pin}`}
                    style={style}
                  >
                    <span className="note-pin" aria-hidden="true" />
                    <div className="note-top">
                      <StatusIcon status="loading" size={44} />
                      <span className="goal-code">{g.goalId}</span>
                    </div>
                    <div className="goal-wording">
                      <SourceMarkup html={g.wording} />
                    </div>
                    <span className="note-state">Wordt nagekeken</span>
                  </article>
                );
              const r = g.result;
              return (
                <details
                  key={g.goalId}
                  className={`note result-card note-${r.status} ${pin}`}
                  style={style}
                  onToggle={(e) => {
                    const el = e.currentTarget;
                    if (el.open)
                      requestAnimationFrame(() =>
                        el.scrollIntoView({ block: "nearest", behavior: "smooth" }),
                      );
                  }}
                >
                  <summary>
                    <span className="note-pin" aria-hidden="true" />
                    <div className="note-top">
                      <span className="stamp" key={r.status}>
                        <StatusIcon status={r.status} size={52} />
                      </span>
                      <span className="goal-code">{g.goalId}</span>
                      {g.needsReview && (
                        <span className="review-flag">Kijk zelf na</span>
                      )}
                    </div>
                    <div className="goal-wording">
                      <SourceMarkup html={g.wording} />
                    </div>
                    <div className="note-foot">
                      <span className={`verdict verdict-${r.status}`}>
                        {verdicts[r.status]}
                      </span>
                      <span className="expand-label">
                        <span className="when-closed">Bekijk waarom</span>
                        <span className="when-open">Klap dicht</span>
                      </span>
                    </div>
                  </summary>
                  <div className="result-detail">
                    <div className="detail-main">
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
                          <h3>Wat ontbreekt</h3>
                          <ul>
                            {r.missingRequirements.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {r.evidence.length > 0 && (
                      <div className="evidence-list">
                        <h3>Bewijs uit je materiaal</h3>
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
                              <span className="page-link-page">p. {e.page}</span>
                            </button>
                            {e.kind === "text" && e.quote && (
                              <blockquote>{e.quote}</blockquote>
                            )}
                            {e.description && <p>{e.description}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="result-source">
                      <span>
                        {g.modelUsed === "gpt-6.1-sol"
                          ? "Onafhankelijk opnieuw gecontroleerd met Sol"
                          : "Beoordeling met Luna"}
                      </span>
                      {g.sourceUrl && (
                        <a href={g.sourceUrl} target="_blank" rel="noreferrer">
                          Officiële bron
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
              );
            })}
            {!done && extra > 0 && (
              <div className="note note-more">
                <span className="note-pin" aria-hidden="true" />+{extra} doelen
              </div>
            )}
          </div>
          {done && !rows.length && (
            <p className="chalk-empty">Geen doelen met deze filter.</p>
          )}
        </div>
        <div className="checkboard-tray">
          {done ? (
            <div className="result-filters" aria-label="Filter beoordelingen" role="group">
              <button
                className="eraser"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                Alle doelen
              </button>
              {(Object.keys(verdicts) as Verdict[]).map((key) => (
                <button
                  key={key}
                  className={`chalk-stick stick-${key}`}
                  aria-pressed={filter === key}
                  disabled={!counts[key]}
                  onClick={() => setFilter(filter === key ? "all" : key)}
                >
                  {verdicts[key]}
                  <span className="stick-count">{counts[key]}</span>
                </button>
              ))}
              {review > 0 && (
                <button
                  className="chalk-stick stick-review"
                  aria-pressed={filter === "review"}
                  onClick={() => setFilter(filter === "review" ? "all" : "review")}
                >
                  Nakijken nodig
                  <span className="stick-count">{review}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="tray-idle" aria-hidden="true">
              <span className="chalk-stick stick-idle stick-covered" />
              <span className="chalk-stick stick-idle stick-partial" />
              <span className="eraser eraser-idle" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
