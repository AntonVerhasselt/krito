"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { useTopicSelection } from "../lib/useTopicSelection";
import { TopicSearch } from "./TopicSearch";
import { Modal } from "./Modal";
import { GoalPreview } from "./GoalPreview";
import { UploadPanel } from "./UploadPanel";
import { EmailGate } from "./EmailGate";
import {
  newCapability,
  saveSession,
  useAnalysisSession,
  type AnalysisSession,
} from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
export function GoalSetPicker() {
  const catalog = useQuery(api.goals.catalogInfo);
  const [selection, setSelection] = useTopicSelection();
  const [showGoals, setShowGoals] = useState(false);
  const [offset, setOffset] = useState(0);
  const session = useAnalysisSession();
  const status = useQuery(api.analyses.getStatus, session ?? "skip");
  const createDraft = useMutation(api.analyses.createDraft),
    updateTopic = useMutation(api.analyses.updateTopic);
  const creating = useRef<Promise<AnalysisSession> | null>(null);
  const [busy, setBusy] = useState(false),
    [emailGate, setEmailGate] = useState(false),
    [error, setError] = useState("");
  const submitted = status && status.status !== "draft";
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
  const selected = useQuery(
    api.goals.getGoalSet,
    selection.goalSetKey
      ? { catalogVersion: selection.catalogVersion, key: selection.goalSetKey }
      : "skip",
  );
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
  return (
    <section className="analysis-panel" aria-labelledby="analysis-title">
      <div className="panel-heading">
        <span className="eyebrow">JOUW LESMATERIAAL, HELDER IN BEELD</span>
        <h2 id="analysis-title">Start je analyse</h2>
        <p>Een onderwerp, je pdf’s en inzicht per leerdoel.</p>
      </div>
      <div className="wizard-steps" aria-label="Stappen">
        <span className="active">
          <b>1</b> Onderwerp
        </span>
        <span className={selected ? "active" : ""}>
          <b>2</b> Materiaal
        </span>
        <span className={emailGate ? "active" : ""}>
          <b>3</b> Analyse
        </span>
      </div>
      {catalog ? (
        <TopicSearch
          selected={selected}
          catalogVersion={catalog.version}
          disabled={
            busy ||
            emailGate ||
            !!submitted ||
            (!!session && status === undefined)
          }
          onSelect={async (topic) => {
            setError("");
            if (session && status?.status === "draft") {
              setBusy(true);
              try {
                await updateTopic({
                  ...session,
                  catalogVersion: topic.catalogVersion,
                  goalSetKey: topic.key,
                });
              } catch (e) {
                setError(safeError(e));
                return;
              } finally {
                setBusy(false);
              }
            }
            setSelection({
              catalogVersion: topic.catalogVersion,
              goalSetKey: topic.key,
            });
            setShowGoals(false);
            setOffset(0);
          }}
        />
      ) : (
        <p className="dropdown-message">Catalogus laden…</p>
      )}
      {selected ? (
        <div className="scope-note">
          <span className="group-tag">
            {selected.group.title}
            <b title={selected.group.routeTitle}>{selected.group.routeCode}</b>
          </span>
          <p>
            {selected.goalCount === 1
              ? "Het bijbehorende leerdoel wordt gecontroleerd."
              : `Alle ${selected.goalCount} bijbehorende leerdoelen worden gecontroleerd.`}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowGoals(true)}
          >
            Bekijk de doelen
          </button>
        </div>
      ) : (
        <p className="field-hint">
          Zoek op onderwerp, leergebied of groep. Alle bijbehorende doelen
          worden meegenomen.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="hero-next-step">
        {submitted && session ? (
          <div>
            <p className="field-hint">
              Je analyse is gestart. Je kunt de voortgang en resultaten volgen.
            </p>
            <Link
              className="primary-button"
              href={`/results/${session.analysisId}`}
            >
              Bekijk mijn analyse →
            </Link>
            <button
              className="text-button"
              onClick={() => {
                saveSession(null);
                setEmailGate(false);
              }}
            >
              Nieuwe analyse
            </button>
          </div>
        ) : emailGate && session ? (
          <EmailGate session={session} onBack={() => setEmailGate(false)} />
        ) : (
          <>
            <UploadPanel
              ensureDraft={ensureDraft}
              session={session}
              files={status?.files ?? []}
              enabled={
                !!selected && !busy && (!session || status !== undefined)
              }
              onBusy={setBusy}
            />
            <button
              className="primary-button"
              disabled={
                !selected ||
                busy ||
                !status?.files.length ||
                status.files.some((f) => f.status !== "ready")
              }
              onClick={async () => {
                setError("");
                try {
                  await ensureDraft();
                  setEmailGate(true);
                } catch (e) {
                  setError(safeError(e));
                }
              }}
            >
              Analyseer mijn materiaal →
            </button>
          </>
        )}
      </div>
      <div className="panel-footer">
        <span className="privacy-mark">
          ⌁ Privé documenten · jouw oordeel blijft centraal
        </span>
        {catalog && (
          <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">
            Op.stap v{catalog.version} ↗
          </a>
        )}
      </div>
      {selected && showGoals && (
        <Modal
          label="Leerdoelen in je analyse"
          onClose={() => setShowGoals(false)}
        >
          <div className="modal-heading">
            <div>
              <h3>{selected.title}</h3>
              <p>
                {selected.group.title} · {selected.goalCount} leerdoelen
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
          <p className="field-hint">
            Dit is de volledige doelenlijst voor je analyse.
          </p>
          <div className="goal-list">
            {goals?.goals.map((goal) => (
              <GoalPreview key={goal.goalId} goal={goal} />
            ))}
          </div>
          <div className="page-controls">
            {offset > 0 && (
              <button onClick={() => setOffset(Math.max(0, offset - 50))}>
                ← Vorige doelen
              </button>
            )}
            {goals?.more && (
              <button onClick={() => setOffset(offset + 50)}>
                Volgende doelen →
              </button>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
