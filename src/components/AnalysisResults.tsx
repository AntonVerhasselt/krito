"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { saveSession, useAccessToken } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { SiteHeader } from "./SiteHeader";
import { GoalBoard, type BoardGoal, type Phase } from "./GoalBoard";
import kritoPointer from "../../public/illustrations/krito-pointer.webp";
import kritoSleepy from "../../public/illustrations/krito-sleepy.webp";

export function AnalysisResults() {
  const { analysisId } = useParams<{ analysisId: string }>();
  const accessToken = useAccessToken(analysisId);
  const credentials = accessToken ? { analysisId, accessToken } : null;
  const status = useQuery(api.analyses.getStatus, credentials ?? "skip"),
    results = useQuery(
      api.analyses.getResults,
      status?.status === "completed" && credentials ? credentials : "skip",
    );
  const working =
    !!status && status.status !== "completed" && status.status !== "failed" && status.status !== "draft";
  // While Krito works, pin up the topic's goals so the board fills before the verdicts land.
  const pending = useQuery(
    api.goals.listGoals,
    status && status.status !== "draft" && status.status !== "failed" && !results?.goals.length
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
  const goals: BoardGoal[] | undefined = results?.goals.length
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
            <Image src={kritoSleepy} alt="" className="state-illustration" sizes="420px" loading="eager" />
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
            <div className="results-heading">
              <Image
                src={kritoPointer}
                alt=""
                className={`results-krito${working ? " is-working" : ""}`}
                sizes="180px"
                priority
              />
              <div>
                <span className="group-tag">
                  {status.topic.group.title}
                  <b title={status.topic.group.routeTitle}>
                    {status.topic.group.routeCode}
                  </b>
                </span>
                <h1>{status.topic.title}</h1>
                <p>
                  {status.topic.goalCount}{" "}
                  {status.topic.goalCount === 1 ? "leerdoel" : "leerdoelen"} uit
                  Op.stap v{status.topic.catalogVersion}
                  {results?.files.length
                    ? `, nagekeken in ${results.files.length} ${results.files.length === 1 ? "pdf" : "pdf’s"}`
                    : ""}
                </p>
              </div>
            </div>
            {status.status === "failed" ? (
              <div className="result-state">
                <Image src={kritoSleepy} alt="" className="state-illustration" sizes="420px" loading="eager" />
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
                <p>Leg je pdf’s op het bord en vul je e-mailadres in.</p>
                <Link className="primary-button" href="/materiaal">
                  Ga naar mijn materiaal
                </Link>
              </div>
            ) : !goals ? (
              <p className="page-loading" role="status">
                Het bord klaarzetten…
              </p>
            ) : (
              <>
                <GoalBoard
                  goals={goals}
                  extra={pending ? Math.max(0, pending.total - pending.goals.length) : 0}
                  phase={
                    status.status === "completed" && results?.goals.length
                      ? "completed"
                      : status.status === "completed"
                        ? status.recheckTotal
                          ? "rechecking"
                          : "checking"
                        : (status.status as Phase)
                  }
                  recheck={{
                    done: status.recheckCompleted,
                    total: status.recheckTotal,
                  }}
                  files={results?.files ?? []}
                  onOpenPdf={(fileId, page) => void openPdf(fileId, page)}
                />
                <p className="results-note">
                  {working
                    ? "Je kunt deze pagina vernieuwen of later terugkomen in dit tabblad. Krito werkt gewoon verder."
                    : "Dit beoordeelt ondersteuning in het lesmateriaal, geen beheersing door leerlingen. Zekerheid beschrijft het vertrouwen van het model in de beoordeling; ze is geen dekkingspercentage of gekalibreerde kans."}
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
