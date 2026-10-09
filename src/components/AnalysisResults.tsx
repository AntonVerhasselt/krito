"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { saveSession, useAccessToken } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { SourceMarkup } from "./SourceMarkup";
const verdicts = {
  covered: "Gedekt",
  partial: "Gedeeltelijk gedekt",
  not_found: "Niet gevonden",
  uncertain: "Onzeker",
};
const progressLabels: Record<string, string> = {
  draft: "Je analyse is nog niet gestart",
  queued: "Analyse staat klaar",
  preparing: "Bestanden voorbereiden",
  checking: "Leerdoelen analyseren",
  rechecking: "Onzekere doelen opnieuw controleren",
};
export function AnalysisResults() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const accessToken = useAccessToken(analysisId);
  const credentials = accessToken ? { analysisId, accessToken } : null;
  const status = useQuery(api.analyses.getStatus, credentials ?? "skip"),
    results = useQuery(
      api.analyses.getResults,
      status?.status === "completed" && credentials ? credentials : "skip",
    );
  const retry = useMutation(api.analyses.retry),
    view = useAction(api.files.getViewUrl);
  const [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const unavailable = !accessToken || status === null;
  const counts = Object.fromEntries(
    Object.keys(verdicts).map((key) => [
      key,
      results?.goals.filter((g) => g.result.status === key).length ?? 0,
    ]),
  );
  const rows =
    results?.goals.filter(
      (g) =>
        filter === "all" ||
        (filter === "review" ? g.needsReview : g.result.status === filter),
    ) ?? [];
  async function openPdf(fileId: string, page: number) {
    if (!credentials) return;
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await view({
        ...credentials,
        fileId: fileId as Id<"files">,
        page,
      });
      if (tab) tab.location.href = url;
      else setError("Sta pop-ups toe om het document te openen.");
    } catch (e) {
      tab?.close();
      setError(safeError(e));
    }
  }
  return (
    <div className="site-shell results-shell">
      <header>
        <Link href="/" className="wordmark">
          krito<span>.</span>
        </Link>
        <Link
          href="/"
          className="text-button"
          onClick={() => saveSession(null)}
        >
          Nieuwe analyse →
        </Link>
      </header>
      <main>
        {unavailable ? (
          <div className="result-state">
            <h1>Analyse niet beschikbaar</h1>
            <p>Open de analyse in het tabblad waarin je ze gestart hebt.</p>
            <Link href="/">Start een nieuwe analyse</Link>
          </div>
        ) : status === undefined ? (
          <p role="status">Analyse laden…</p>
        ) : (
          <>
            <div className="results-heading">
              <span className="eyebrow">JOUW LESMATERIAAL IN BEELD</span>
              <h1>{status.topic.title}</h1>
              <span className="group-tag">
                {status.topic.group.title}
                <b title={status.topic.group.routeTitle}>
                  {status.topic.group.routeCode}
                </b>
              </span>
              <p>
                {status.topic.goalCount}{" "}
                {status.topic.goalCount === 1 ? "leerdoel" : "leerdoelen"} ·
                Op.stap v{status.topic.catalogVersion}
              </p>
            </div>
            {status.status === "failed" ? (
              <div className="result-state">
                <h2>De analyse is onderbroken</h2>
                <p>{safeError(status.safeError)}</p>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={async () => {
                    if (!credentials) return;
                    setBusy(true);
                    setError("");
                    try {
                      await retry(credentials);
                    } catch (e) {
                      setError(safeError(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Opnieuw starten…" : "Probeer opnieuw"}
                </button>
              </div>
            ) : status.status !== "completed" ? (
              <div className="result-state" role="status">
                <span className="progress-indicator" aria-hidden="true" />
                <h2>{progressLabels[status.status]}</h2>
                {status.status === "rechecking" && (
                  <p>
                    {status.recheckCompleted} van {status.recheckTotal} opnieuw
                    gecontroleerd
                  </p>
                )}
                <p>
                  {status.status === "draft"
                    ? "Voeg materiaal toe en vul je e-mailadres in op de startpagina."
                    : "Je kunt deze pagina vernieuwen. De analyse gaat verder."}
                </p>
                {status.status === "draft" && (
                  <Link href="/">Ga naar mijn materiaal →</Link>
                )}
              </div>
            ) : !results ? (
              <p role="status">Beoordelingen laden…</p>
            ) : (
              <>
                <div className="results-summary">
                  {Object.entries(verdicts).map(([key, label]) => (
                    <div key={key}>
                      <strong>{counts[key]}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <p className="results-note">
                  Dit beoordeelt ondersteuning in het lesmateriaal, geen
                  beheersing door leerlingen. Zekerheid beschrijft het
                  vertrouwen van het model in de beoordeling; ze is geen
                  dekkingspercentage of gekalibreerde kans.
                </p>
                <div
                  className="result-filters"
                  aria-label="Filter beoordelingen"
                >
                  {[
                    ["all", "Alle doelen"],
                    ...Object.entries(verdicts),
                    ["review", "Nakijken nodig"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="result-goals">
                  {rows.map((g) => (
                    <details className="result-card" key={g.snapshot.goalId}>
                      <summary>
                        <div className="result-card-heading">
                          <span className="goal-code">{g.snapshot.goalId}</span>
                          <span
                            className={`verdict verdict-${g.result.status}`}
                          >
                            {verdicts[g.result.status]}
                          </span>
                        </div>
                        <div className="goal-wording">
                          <SourceMarkup html={g.snapshot.wording} />
                        </div>
                        <div className="result-card-meta">
                          <span>
                            Zekerheid van beoordeling: {g.result.confidence}/100
                          </span>
                          {g.needsReview && <strong>Nakijken nodig</strong>}
                          <span className="expand-label">Details ↴</span>
                        </div>
                      </summary>
                      <div className="result-detail">
                        <p>{g.result.explanation}</p>
                        <p className="confidence-reason">
                          {g.result.confidenceReason}
                        </p>
                        {g.needsReview && (
                          <p className="review-note">
                            {g.reviewReason === "recheck_failed"
                              ? "De tweede controle is mislukt. De oorspronkelijke beoordeling blijft bewaard; kijk dit doel zelf na."
                              : "Ook na de tweede controle blijft de beoordeling onzeker. Kijk dit doel zelf na."}
                          </p>
                        )}
                        {g.result.evidence.length > 0 && (
                          <div className="evidence-list">
                            <h3>Bewijs uit je materiaal</h3>
                            <p className="field-hint">
                              Deze verwijzingen en citaten zijn door het model
                              gemaakt. Controleer ze in de pdf.
                            </p>
                            {g.result.evidence.map((e, i) => (
                              <div className="evidence" key={i}>
                                <button
                                  className="text-button"
                                  onClick={() => void openPdf(e.fileId, e.page)}
                                >
                                  {
                                    results.files.find(
                                      (f) => f.fileId === e.fileId,
                                    )?.name
                                  }{" "}
                                  · pagina {e.page} ↗
                                </button>
                                {e.kind === "text" && (
                                  <blockquote>{e.quote}</blockquote>
                                )}
                                {e.description && <p>{e.description}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                        {g.result.missingRequirements.length > 0 && (
                          <div>
                            <h3>Wat ontbreekt</h3>
                            <ul>
                              {g.result.missingRequirements.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="result-source">
                          <span>
                            {g.modelUsed === "gpt-6.1-sol"
                              ? "Onafhankelijk opnieuw gecontroleerd met Sol"
                              : "Beoordeling met Luna"}
                          </span>
                          <a
                            href={g.snapshot.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Officiële bron ↗
                          </a>
                        </div>
                        {g.snapshot.clarification && (
                          <details>
                            <summary>Officiële toelichting</summary>
                            <div className="source-clarification">
                              <SourceMarkup html={g.snapshot.clarification} />
                            </div>
                          </details>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
                {!rows.length && (
                  <p className="empty-state">Geen doelen met deze filter.</p>
                )}
              </>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer>
        <span>Je documenten blijven privé.</span>
        <span>Jouw professionele oordeel blijft centraal.</span>
      </footer>
    </div>
  );
}
