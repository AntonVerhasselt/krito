"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { saveSession, useAccessToken } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { SiteHeader } from "./SiteHeader";
import { GoalList, type ListGoal, type Phase } from "./GoalList";

export function AnalysisResults() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const accessToken = useAccessToken(analysisId);
  const credentials = accessToken ? { analysisId, accessToken } : null;
  const status = useQuery(api.analyses.getStatus, credentials ?? "skip");
  const results = useQuery(
    api.analyses.getResults,
    (status?.status === "completed" || status?.status === "rechecking") &&
      credentials
      ? credentials
      : "skip",
  );
  const submitted =
    !!status && status.status !== "draft" && status.status !== "failed";
  // Until the first results are saved, list the topic's goals as pending.
  const pending = useQuery(
    api.goals.listGoals,
    status && submitted && !results?.goals.length
      ? {
          catalogVersion: status.topic.catalogVersion,
          goalSetKey: status.topic.key,
        }
      : "skip",
  );
  const retry = useMutation(api.analyses.retry),
    view = useAction(api.files.getViewUrl);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const unavailable = !accessToken || status === null;
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
  const goals: ListGoal[] | undefined = results?.goals.length
    ? results.goals.map((g) => ({
        goalId: g.snapshot.goalId,
        wording: g.snapshot.wording,
        clarification: g.snapshot.clarification,
        sourceUrl: g.snapshot.sourceUrl,
        result: g.result,
        modelUsed: g.modelUsed,
        needsReview: g.needsReview,
        reviewReason: g.reviewReason,
      }))
    : pending?.goals.map((g) => ({ goalId: g.goalId, wording: g.wording }));
  const phase: Phase | undefined = !status
    ? undefined
    : status.status === "completed"
      ? results?.goals.length
        ? "completed"
        : "rechecking"
      : status.status === "draft" || status.status === "failed"
        ? undefined
        : status.status;
  const fileCount = results?.files.length || status?.files.length || 0;

  return (
    <div className="site-shell results-shell">
      <SiteHeader>
        <Link href="/" className="back-link" onClick={() => saveSession(null)}>
          Nieuwe analyse
        </Link>
      </SiteHeader>
      <main className="results">
        {unavailable ? (
          <div className="result-state">
            <h1>Analyse niet beschikbaar</h1>
            <p>Open de analyse in het tabblad waarin je ze gestart hebt.</p>
            <Link className="primary-button" href="/">
              Start een nieuwe analyse
            </Link>
          </div>
        ) : status === undefined ? (
          <p className="page-loading" role="status">
            Analyse laden…
          </p>
        ) : (
          <>
            <header className="results-heading">
              <p className="results-context">
                {status.topic.path
                  .slice(0, -1)
                  .map((p) => p.title)
                  .join(" / ")}
              </p>
              <h1>{status.topic.title}</h1>
              <div className="results-meta">
                <span className="group-tag">
                  {status.topic.group.title}
                  <b title={status.topic.group.routeTitle}>
                    {status.topic.group.routeCode}
                  </b>
                </span>
                <span>
                  {status.topic.goalCount}{" "}
                  {status.topic.goalCount === 1 ? "leerdoel" : "leerdoelen"}
                </span>
                {fileCount > 0 && (
                  <span>
                    {fileCount} {fileCount === 1 ? "bestand" : "bestanden"}
                  </span>
                )}
                <span>Op.stap v{status.topic.catalogVersion}</span>
              </div>
            </header>
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
            ) : status.status === "draft" ? (
              <div className="result-state">
                <h2>Je analyse is nog niet gestart</h2>
                <p>Voeg je lesmateriaal toe en vul je e-mailadres in.</p>
                <Link className="primary-button" href="/materiaal">
                  Ga naar mijn materiaal
                </Link>
              </div>
            ) : !goals || !phase ? (
              <p className="page-loading" role="status">
                Leerdoelen laden…
              </p>
            ) : (
              <>
                <GoalList
                  goals={goals}
                  total={status.topic.goalCount}
                  phase={phase}
                  recheck={{
                    done: status.recheckCompleted,
                    total: status.recheckTotal,
                  }}
                  files={results?.files ?? []}
                  onOpenPdf={(fileId, page) => void openPdf(fileId, page)}
                />
                {pending?.more && (
                  <p className="results-more">
                    En nog {pending.total - pending.goals.length} leerdoelen.
                  </p>
                )}
                <p className="results-note">
                  Krito beoordeelt of je lesmateriaal een leerdoel
                  ondersteunt, niet of leerlingen het beheersen. Zekerheid
                  beschrijft het vertrouwen van het model in de beoordeling;
                  ze is geen dekkingspercentage of gekalibreerde kans.
                </p>
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
    </div>
  );
}
