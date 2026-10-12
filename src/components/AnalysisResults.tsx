"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAccessToken } from "../lib/analysisSession";
import { analyticsContext, identifyContact, track, trackOnce, captureAnalyticsError } from "../lib/analytics";
import { analyticsErrorCode } from "../../shared/analytics";
import { safeError } from "../lib/safeError";
import { ResultsPending } from "./ResultsPending";
import { GoalList, type ListGoal, type Phase } from "./GoalList";
import {
  demoFiles,
  demoGoals,
  demoGoalsRunning,
  demoTopic,
} from "../lib/demoAnalysis";

const subscribeHydration = () => () => {};

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

/** /results/demo and /results/demo-loopt: a fixed example to preview the results page without running an analysis. */
export function DemoResults({ running }: { running: boolean }) {
  const goals = running ? demoGoalsRunning : demoGoals;
  return (
    <>
      <ResultsHeading topic={demoTopic} fileCount={demoFiles.length} />
      <GoalList
        goals={goals}
        total={demoTopic.goalCount}
        phase={running ? "rechecking" : "completed"}
        recheck={{ done: 1, total: 3 }}
        files={demoFiles}
        analytics={{ is_demo: true, surface: "demo_results" }}
        onOpenPdf={() => {}}
      />
      <ResultsNote />
    </>
  );
}

export function AnalysisResults() {
  const { analysisId } = useParams<{ analysisId: string }>();
  return <LiveResults analysisId={analysisId} />;
}

function LiveResults({ analysisId }: { analysisId: string }) {
  const accessToken = useAccessToken(analysisId);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
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
  useEffect(() => {
    if (status) {
      if (status.analyticsDistinctId) identifyContact(status.analyticsDistinctId);
      const properties = { analysis_id: analysisId, attempt: status.attempt, stage: status.status, is_demo: false };
      trackOnce(`results:${analysisId}`, "analysis_results_viewed", properties);
      if (status.status !== "draft" && status.status !== "failed" && status.status !== "completed")
        trackOnce(`progress:${analysisId}:${status.attempt}:${status.status}`, "analysis_progress_viewed", properties);
      if (status.status === "completed" && results)
        trackOnce(`completed-results:${analysisId}:${status.attempt}`, "analysis_completed_results_viewed", {
          ...properties, goal_count: results.goals.length, file_count: results.files.length,
        });
    }
    if (status === null || (hydrated && !accessToken))
      trackOnce(`unavailable:${analysisId}`, "analysis_results_unavailable", { reason: accessToken ? "unavailable" : "missing_access" });
  }, [status, results, analysisId, hydrated, accessToken]);
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
      if (tab) {
        tab.location.href = url;
        track("evidence_opened", { analysis_id: analysisId, file_id: fileId, page });
      } else {
        track("evidence_open_failed", { analysis_id: analysisId, file_id: fileId, reason: "popup_blocked" });
        setError("Sta pop-ups toe om het document te openen.");
      }
    } catch (e) {
      tab?.close();
      track("evidence_open_failed", { analysis_id: analysisId, file_id: fileId, error_code: analyticsErrorCode(e) });
      captureAnalyticsError(e, "evidence_open", { analysis_id: analysisId });
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
    <>
      {!hydrated || (accessToken && status === undefined) ? (
        <ResultsPending />
      ) : unavailable ? (
        <div className="result-state">
          <h1>Analyse niet beschikbaar</h1>
          <p>Open de analyse in het tabblad waarin je ze gestart hebt.</p>
          <Link className="primary-button" href="/">
            Start een nieuwe analyse
          </Link>
        </div>
      ) : status ? (
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
                  track("analysis_retry_clicked", { analysis_id: analysisId, attempt: status.attempt });
                  setBusy(true);
                  setError("");
                  try {
                    await retry({ ...credentials, analyticsContext: analyticsContext() });
                  } catch (e) {
                    track("analysis_retry_failed", { analysis_id: analysisId, error_code: analyticsErrorCode(e) });
                    captureAnalyticsError(e, "analysis_retry", { analysis_id: analysisId });
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
              <Link className="primary-button" href="/materiaal" onClick={() => track("results_return_to_material_clicked", { analysis_id: analysisId })}>
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
                analytics={{ analysis_id: analysisId, attempt: status.attempt, is_demo: false }}
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
      ) : null}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
