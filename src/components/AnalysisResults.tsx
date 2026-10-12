"use client";
import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { saveSession, useAccessToken } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { SiteHeader } from "./SiteHeader";
import { GoalList, type ListGoal, type Phase } from "./GoalList";
import {
  demoFiles,
  demoGoals,
  demoGoalsRunning,
  demoTopic,
} from "../lib/demoAnalysis";

type HeadingTopic = {
  title: string;
  path: { title: string }[];
  group: { title: string; routeCode: string; routeTitle: string };
  goalCount: number;
  catalogVersion: string;
};

function ResultsHeading({
  topic,
  fileCount,
}: {
  topic: HeadingTopic;
  fileCount: number;
}) {
  return (
    <header className="results-heading" data-topic={topic.title}>
      <p className="results-context">
        {topic.path
          .slice(0, -1)
          .map((p) => p.title)
          .join(" / ")}
      </p>
      <h1>{topic.title}</h1>
      <div className="results-meta">
        <span className="group-tag">
          {topic.group.title}
          <b title={topic.group.routeTitle}>{topic.group.routeCode}</b>
        </span>
        <span>
          {topic.goalCount} {topic.goalCount === 1 ? "leerdoel" : "leerdoelen"}
        </span>
        {fileCount > 0 && (
          <span>
            {fileCount} {fileCount === 1 ? "bestand" : "bestanden"}
          </span>
        )}
        <span>Op.stap v{topic.catalogVersion}</span>
      </div>
    </header>
  );
}

function ResultsNote() {
  return (
    <p className="results-note">
      Krito beoordeelt of je lesmateriaal een leerdoel ondersteunt, niet of
      leerlingen het beheersen. Zekerheid beschrijft het vertrouwen van het
      model in de beoordeling; ze is geen dekkingspercentage of gekalibreerde
      kans.
    </p>
  );
}

function ResultsShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell results-shell">
      <SiteHeader>
        <Link href="/" className="back-link" onClick={() => saveSession(null)}>
          Nieuwe analyse
        </Link>
      </SiteHeader>
      <main className="results">{children}</main>
    </div>
  );
}

/** /results/demo and /results/demo-loopt: a fixed example to preview the results page without running an analysis. */
function DemoResults({ running }: { running: boolean }) {
  const goals = running ? demoGoalsRunning : demoGoals;
  return (
    <ResultsShell>
      <ResultsHeading topic={demoTopic} fileCount={demoFiles.length} />
      <GoalList
        goals={goals}
        total={demoTopic.goalCount}
        phase={running ? "rechecking" : "completed"}
        recheck={{ done: 1, total: 3 }}
        files={demoFiles}
        onOpenPdf={() => {}}
      />
      <ResultsNote />
    </ResultsShell>
  );
}

export function AnalysisResults() {
  const { analysisId } = useParams<{ analysisId: string }>();
  if (analysisId === "demo" || analysisId === "demo-loopt")
    return <DemoResults running={analysisId === "demo-loopt"} />;
  return <LiveResults analysisId={analysisId} />;
}

function LiveResults({ analysisId }: { analysisId: string }) {
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
    status &&
      submitted &&
      status.status !== "completed" &&
      !results?.goals.length
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
  // Saved results once there are any (or once the analysis is finished);
  // until then the topic's goals are listed as pending.
  const goals: ListGoal[] | undefined =
    results && (results.goals.length || status?.status === "completed")
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
      ? // A finished analysis waits for its results instead of showing a
        // recheck that isn't happening.
        results
        ? "completed"
        : undefined
      : status.status === "draft" || status.status === "failed"
        ? undefined
        : status.status;
  const fileCount = results?.files.length || status?.files.length || 0;

  return (
    <ResultsShell>
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
          <ResultsHeading topic={status.topic} fileCount={fileCount} />
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
              <ResultsNote />
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </ResultsShell>
  );
}
