"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { chooseTopic } from "../lib/chooseTopic";
import { safeError } from "../lib/safeError";
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
import { analyticsContext, track, trackOnce } from "../lib/analytics";
import { SiteHeader } from "./SiteHeader";
import { UploadPanel } from "./UploadPanel";
import { EmailGate } from "./EmailGate";
import { SendToSelf } from "./SendToSelf";
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

/** The topic an e-mail link carries ("versie|onderwerp"), read from the address bar. */
const linkListeners = new Set<() => void>();
function subscribeLink(listener: () => void) {
  linkListeners.add(listener);
  return () => {
    linkListeners.delete(listener);
  };
}
function linkSnapshot() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("onderwerp"),
    catalogVersion = params.get("versie");
  return key && catalogVersion ? `${catalogVersion}|${key}` : "";
}
/** Removes the e-mail link's topic from the address bar once it has been applied. */
function dropLinkParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("onderwerp");
  url.searchParams.delete("versie");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  linkListeners.forEach((listener) => listener());
}

export function MaterialStep() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [selection, setSelection] = useTopicSelection();
  const convex = useConvex();
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
  const [askEmail, setAskEmail] = useState(false);
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
    if (selected) trackOnce(`material:${selected.catalogVersion}:${selected.key}`, "material_step_viewed", {
      subject_key: selected.key, goal_count: selected.goalCount, file_count: files.length,
      restored: !!session, analysis_id: session?.analysisId,
    });
    if (ready && session) trackOnce(`ready:${session.analysisId}`, "material_ready", {
      analysis_id: session.analysisId, file_count: files.length, goal_count: selected?.goalCount,
    });
  }, [selected, session, ready, files.length]);
  function closeGoals(reason: string) {
    track("goal_preview_closed", { subject_key: selected?.key, reason });
    setShowGoals(false);
  }
  function closeEmail(reason: string) {
    track("email_gate_closed", { analysis_id: session?.analysisId, reason });
    setAskEmail(false);
  }
  // The "stuur dit naar mezelf" e-mail links here with the topic in the URL.
  // Until that topic is the selection, the page must not redirect home.
  const link = useSyncExternalStore(subscribeLink, linkSnapshot, () => "");
  const [linkError, setLinkError] = useState("");
  const [linkTry, setLinkTry] = useState(0);
  const handledLink = useRef("");
  useEffect(() => {
    // After hydration, so a draft from this browser's session is known.
    const attempt = `${link}#${linkTry}`;
    if (!hydrated || !link || handledLink.current === attempt) return;
    handledLink.current = attempt;
    const [catalogVersion, key] = link.split("|");
    chooseTopic(convex, session, status, { catalogVersion, key }, setSelection).then(
      () => setLinkError(""),
      // The current draft and selection stay as they were; the link stays for a retry.
      (e) => setLinkError(safeError(e)),
    );
  }, [hydrated, link, linkTry, convex, session, status, setSelection]);
  useEffect(() => {
    if (link && link === `${selection.catalogVersion}|${selection.goalSetKey}`) dropLinkParams();
  }, [link, selection.catalogVersion, selection.goalSetKey]);
  useEffect(() => {
    if (link) return;
    if (hydrated && (!selection.goalSetKey || selected === null))
      router.replace("/");
  }, [link, hydrated, selection.goalSetKey, selected, router]);

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
        analyticsContext: analyticsContext(),
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
        <Link href="/" className="back-link" onClick={() => track("subject_change_clicked", { subject_key: selected?.key, file_count: files.length })}>
          <span aria-hidden="true">‹</span> Ander onderwerp
        </Link>
      </SiteHeader>
      <main className="material">
        <div className="material-heading">
          {selected ? (
            <>
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
                    track("goal_preview_opened", { subject_key: selected.key, goal_count: selected.goalCount });
                    setOffset(0);
                    setShowGoals(true);
                  }}
                >
                  Bekijk de doelen
                </button>
              </p>
            </>
          ) : (
            <>
              <h1>Voeg je lesmateriaal toe</h1>
              <p>Krito legt de leerdoelen van je onderwerp naast je materiaal.</p>
            </>
          )}
        </div>
        {linkError && (
          <p className="form-error" role="alert">
            {linkError}{" "}
            <button type="button" className="text-button" onClick={() => setLinkTry((n) => n + 1)}>
              Probeer opnieuw
            </button>
          </p>
        )}
        {submitted && session ? (
          <div className="started-note">
            <h2>Je analyse is gestart</h2>
            <p>Je kunt de voortgang en de resultaten volgen.</p>
            <div className="started-actions">
              <Link
                className="primary-button"
                href={`/results/${session.analysisId}`}
                onClick={() => track("analysis_resume_clicked", { analysis_id: session.analysisId })}
              >
                Bekijk mijn analyse
              </Link>
              <button
                className="text-button"
                onClick={() => {
                  track("analysis_new_clicked", { analysis_id: session.analysisId });
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
            {selected && <SendToSelf topic={selected} />}
            <UploadPanel
              ensureDraft={ensureDraft}
              session={session}
              files={files}
              enabled={!!selected && !busy && (!session || status !== undefined)}
              onBusy={setBusy}
              footer={
                <>
                  <button
                    type="button"
                    className="primary-button start-button"
                    disabled={!selected || !ready || busy || !session}
                    onClick={() => { track("analysis_start_clicked", { analysis_id: session?.analysisId, file_count: files.length }); track("email_gate_opened", { analysis_id: session?.analysisId }); setAskEmail(true); }}
                  >
                    Start de analyse
                  </button>
                  <p className="field-hint">
                    {!files.length
                      ? "Voeg minstens één bestand toe om te starten."
                      : selected && ready && !busy
                        ? `Krito legt ${selected.goalCount === 1 ? "het leerdoel" : `alle ${selected.goalCount} leerdoelen`} naast je materiaal.`
                        : files.some((f) => f.status === "invalid")
                          ? "Verwijder de bestanden die niet lukten om te starten."
                          : "Even wachten tot elk bestand gecontroleerd is."}
                  </p>
                </>
              }
            />
          </>
        )}
      </main>
      {askEmail && session && (
        <Modal
          label="Start de analyse"
          narrow
          onClose={() => closeEmail("dismiss")}
        >
          <EmailGate session={session} onCancel={() => closeEmail("cancel")} />
        </Modal>
      )}
      {selected && showGoals && (
        <Modal
          label="Leerdoelen in je analyse"
          onClose={() => closeGoals("dismiss")}
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
              onClick={() => closeGoals("close")}
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
              <button onClick={() => { track("goal_preview_page_changed", { direction: "previous", page: Math.max(0, offset / 50 - 1) }); setOffset(Math.max(0, offset - 50)); }}>
                Vorige doelen
              </button>
            )}
            {goals?.more && (
              <button onClick={() => { track("goal_preview_page_changed", { direction: "next", page: offset / 50 + 1 }); setOffset(offset + 50); }}>
                Volgende doelen
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
