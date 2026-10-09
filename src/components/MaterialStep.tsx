"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import { useTopicSelection } from "../lib/useTopicSelection";
import {
  newCapability,
  saveSession,
  useAnalysisSession,
  type AnalysisSession,
} from "../lib/analysisSession";
import { SiteHeader } from "./SiteHeader";
import { UploadPanel } from "./UploadPanel";
import { EmailGate } from "./EmailGate";
import { Modal } from "./Modal";
import { GoalPreview } from "./GoalPreview";

const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function MaterialStep() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [selection] = useTopicSelection();
  const selected = useQuery(
    api.goals.getGoalSet,
    selection.goalSetKey
      ? { catalogVersion: selection.catalogVersion, key: selection.goalSetKey }
      : "skip",
  );
  const session = useAnalysisSession();
  const status = useQuery(api.analyses.getStatus, session ?? "skip");
  const createDraft = useMutation(api.analyses.createDraft),
    updateTopic = useMutation(api.analyses.updateTopic);
  const creating = useRef<Promise<AnalysisSession> | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [offset, setOffset] = useState(0);
  const goals = useQuery(
    api.goals.listGoals,
    selected && showGoals
      ? {
          catalogVersion: selected.catalogVersion,
          goalSetKey: selected.key,
          offset,
        }
      : "skip",
  );
  const submitted = status && status.status !== "draft";
  const files = status?.files ?? [];
  const ready = files.length > 0 && files.every((f) => f.status === "ready");

  useEffect(() => {
    if (hydrated && (!selection.goalSetKey || selected === null))
      router.replace("/");
  }, [hydrated, selection.goalSetKey, selected, router]);

  async function ensureDraft(): Promise<AnalysisSession> {
    if (!selected) throw new Error("invalid_topic");
    if (session && status?.status === "draft") {
      if (
        status.topic.key !== selected.key ||
        status.topic.catalogVersion !== selected.catalogVersion
      )
        await updateTopic({
          ...session,
          catalogVersion: selected.catalogVersion,
          goalSetKey: selected.key,
        });
      return session;
    }
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const { capabilityHash, accessToken } = await newCapability();
      const analysisId = await createDraft({
        capabilityHash,
        catalogVersion: selected.catalogVersion,
        goalSetKey: selected.key,
      });
      const next = { analysisId, accessToken };
      saveSession(next);
      return next;
    })();
    try {
      return await creating.current;
    } finally {
      creating.current = null;
    }
  }

  return (
    <div className="site-shell material-shell">
      <SiteHeader>
        <Link href="/" className="back-link">
          <span aria-hidden="true">‹</span> Ander onderwerp
        </Link>
      </SiteHeader>
      <main className="material">
        {!selected ? (
          <p className="page-loading" role="status">
            Onderwerp ophalen…
          </p>
        ) : (
          <>
            <div className="material-heading">
              <span className="group-tag">
                {selected.group.title}
                <b title={selected.group.routeTitle}>
                  {selected.group.routeCode}
                </b>
              </span>
              <h1>{selected.title}</h1>
              <p>
                {selected.goalCount === 1
                  ? "Het bijbehorende leerdoel wordt gecontroleerd."
                  : `Alle ${selected.goalCount} bijbehorende leerdoelen worden gecontroleerd.`}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setOffset(0);
                    setShowGoals(true);
                  }}
                >
                  Bekijk de doelen
                </button>
              </p>
            </div>
            {submitted && session ? (
              <div className="started-note">
                <h2>Je analyse is gestart</h2>
                <p>Je kunt de voortgang en de resultaten volgen op het bord.</p>
                <div className="started-actions">
                  <Link
                    className="primary-button"
                    href={`/results/${session.analysisId}`}
                  >
                    Bekijk mijn analyse
                  </Link>
                  <button
                    className="text-button"
                    onClick={() => {
                      saveSession(null);
                      router.push("/");
                    }}
                  >
                    Nieuwe analyse
                  </button>
                </div>
              </div>
            ) : (
              <>
                <UploadPanel
                  ensureDraft={ensureDraft}
                  session={session}
                  files={files}
                  enabled={!busy && (!session || status !== undefined)}
                  onBusy={setBusy}
                />
                {files.length > 0 && session && (
                  <EmailGate session={session} ready={ready && !busy} />
                )}
              </>
            )}
          </>
        )}
      </main>
      {selected && showGoals && (
        <Modal
          label="Leerdoelen in je analyse"
          onClose={() => setShowGoals(false)}
        >
          <div className="modal-heading">
            <div>
              <h2>{selected.title}</h2>
              <p>
                {selected.group.title}, {selected.goalCount}{" "}
                {selected.goalCount === 1 ? "leerdoel" : "leerdoelen"}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Sluit leerdoelen"
              onClick={() => setShowGoals(false)}
            >
              ×
            </button>
          </div>
          <div className="goal-list">
            {goals?.goals.map((goal) => (
              <GoalPreview key={goal.goalId} goal={goal} />
            ))}
          </div>
          <div className="page-controls">
            {offset > 0 && (
              <button onClick={() => setOffset(Math.max(0, offset - 50))}>
                Vorige doelen
              </button>
            )}
            {goals?.more && (
              <button onClick={() => setOffset(offset + 50)}>
                Volgende doelen
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
