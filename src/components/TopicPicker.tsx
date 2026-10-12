"use client";
import { useState } from "react";
import { useConvex, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { useTopicSelection } from "../lib/useTopicSelection";
import { useAnalysisSession } from "../lib/analysisSession";
import { chooseTopic } from "../lib/chooseTopic";
import { track, captureAnalyticsError } from "../lib/analytics";
import { analyticsErrorCode } from "../../shared/analytics";
import { safeError } from "../lib/safeError";
import { TopicSearch, type Topic } from "./TopicSearch";

export function TopicPicker() {
  const router = useRouter();
  const convex = useConvex();
  const catalog = useQuery(api.goals.catalogInfo);
  const [selection, setSelection] = useTopicSelection();
  const selected = useQuery(
    api.goals.getGoalSet,
    selection.goalSetKey
      ? { catalogVersion: selection.catalogVersion, key: selection.goalSetKey }
      : "skip",
  );
  const session = useAnalysisSession();
  const live = useQuery(api.analyses.getStatus, session ?? "skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = live && live.status !== "draft";

  async function choose(topic: Topic) {
    setError("");
    setBusy(true);
    try {
      const { keptDraft } = await chooseTopic(convex, session, live, topic, setSelection);
      track("subject_selected", { subject_key: topic.key, catalog_version: topic.catalogVersion,
        group_key: topic.group.sourceKey, route_code: topic.group.routeCode, goal_count: topic.goalCount,
        had_existing_draft: keptDraft });
      router.push("/materiaal");
    } catch (e) {
      track("subject_selection_failed", { subject_key: topic.key, error_code: analyticsErrorCode(e) });
      captureAnalyticsError(e, "subject_selection");
      setError(safeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="topic-picker">
      <TopicSearch
        selected={selected}
        catalogVersion={catalog?.version}
        disabled={busy}
        onSelect={(topic) => void choose(topic)}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {running && session ? (
        <p className="resume-note">
          Je analyse van <b>{live.topic.title}</b>{" "}
          {live.status === "completed" ? "is klaar." : "loopt nog."}{" "}
          <Link href={`/results/${session.analysisId}`} onClick={() => track("analysis_resume_clicked", { analysis_id: session.analysisId })}>Bekijk je analyse</Link>
        </p>
      ) : selected && session && live?.status === "draft" ? (
        <p className="resume-note">
          Je was bezig met <b>{selected.title}</b>.{" "}
          <Link href="/materiaal" onClick={() => track("analysis_resume_clicked", { analysis_id: session.analysisId })}>Ga verder met je materiaal</Link>
        </p>
      ) : (
        <p className="catalog-note">
          Alle leerdoelen uit{" "}
          {catalog ? (
            <a href={catalog.sourceUrl} target="_blank" rel="noreferrer" onClick={() => track("official_source_clicked", { source: "catalog" })}>
              Op.stap v{catalog.version}
            </a>
          ) : (
            "Op.stap"
          )}
          , per onderwerp en leerjaar.
        </p>
      )}
    </div>
  );
}
