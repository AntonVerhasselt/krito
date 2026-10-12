"use client";
import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { useTopicSelection } from "../lib/useTopicSelection";
import { saveSession, useAnalysisSession } from "../lib/analysisSession";
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
  const updateTopic = useMutation(api.analyses.updateTopic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = live && live.status !== "draft";

  async function choose(topic: Topic) {
    setError("");
    setBusy(true);
    try {
      // The search never waits for the analysis status; if it hasn't loaded
      // yet, fetch it once so a draft keeps its uploaded files.
      const status =
        session && live === undefined
          ? await convex.query(api.analyses.getStatus, session)
          : live;
      if (session && status?.status === "draft")
        await updateTopic({
          ...session,
          catalogVersion: topic.catalogVersion,
          goalSetKey: topic.key,
        });
      else if (session) saveSession(null);
      setSelection({
        catalogVersion: topic.catalogVersion,
        goalSetKey: topic.key,
      });
      router.push("/materiaal");
    } catch (e) {
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
          <Link href={`/results/${session.analysisId}`}>Bekijk je analyse</Link>
        </p>
      ) : selected && session && live?.status === "draft" ? (
        <p className="resume-note">
          Je was bezig met <b>{selected.title}</b>.{" "}
          <Link href="/materiaal">Ga verder met je materiaal</Link>
        </p>
      ) : (
        <p className="catalog-note">
          Alle leerdoelen uit{" "}
          {catalog ? (
            <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">
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
