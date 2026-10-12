"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { analyticsContext, track, trackOnce } from "../lib/analytics";
import { Modal } from "./Modal";
import { SchoolEmailForm } from "./SchoolEmailForm";

type Topic = { key: string; catalogVersion: string; title: string; group: { title: string; sourceKey: string } };

const phone = "(max-width: 900px)";

/**
 * On a phone the lesson files are usually on the computer: a card above the
 * upload sends a link to this topic by e-mail. CSS shows it on small screens only.
 */
export function SendToSelf({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false),
    [sent, setSent] = useState(false),
    [pending, setPending] = useState(false);
  // Each opening gets a number, so a late answer can't change a newer form.
  const opening = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const request = useMutation(api.reminders.request);
  const analytics = { subject_key: topic.key, group_key: topic.group.sourceKey, source: "reminder" };
  useEffect(() => {
    // Counted whenever the card is actually shown, also after rotating or resizing.
    const query = window.matchMedia(phone);
    const viewed = () => {
      if (query.matches)
        trackOnce(`reminder-prompt:${topic.catalogVersion}:${topic.key}`, "reminder_prompt_viewed", {
          subject_key: topic.key,
          group_key: topic.group.sourceKey,
        });
    };
    viewed();
    query.addEventListener("change", viewed);
    return () => query.removeEventListener("change", viewed);
  }, [topic.key, topic.catalogVersion, topic.group.sourceKey]);
  useEffect(() => {
    if (sent) closeButton.current?.focus();
  }, [sent]);
  function close(reason: string) {
    track("reminder_gate_closed", { subject_key: topic.key, reason: sent ? "sent" : reason });
    opening.current++;
    setOpen(false);
    setSent(false);
  }
  return (
    <section className="send-self leaf" aria-labelledby="send-self-title">
      <h2 id="send-self-title">Staan je bestanden op je computer?</h2>
      <p>
        Stuur jezelf een link naar {topic.title}, {topic.group.title}. Op je computer voeg je dan je bestanden toe.
      </p>
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          track("reminder_gate_opened", { subject_key: topic.key });
          opening.current++;
          setOpen(true);
        }}
      >
        Stuur dit naar mezelf
      </button>
      <p className="send-self-alt">Of neem hieronder een foto van een blad op papier.</p>
      {open && (
        <Modal label="Stuur dit naar jezelf" narrow dismissible={!pending} onClose={() => close("dismiss")}>
          {sent ? (
            <div className="email-gate send-self-done">
              <div className="modal-heading">
                <h2>Verstuurd</h2>
              </div>
              <p className="email-gate-lead" role="status">
                Open de mail op je computer. Niets gekregen? Kijk dan even bij je ongewenste mail.
              </p>
              <div className="email-actions">
                <button type="button" className="primary-button" ref={closeButton} onClick={() => close("close")}>
                  Sluit
                </button>
              </div>
            </div>
          ) : (
            <SchoolEmailForm
              id="reminder-email"
              title="Stuur dit naar jezelf"
              lead={`We mailen je een link naar ${topic.title}, ${topic.group.title}. Open hem op je computer en voeg daar je bestanden toe. Er start nu nog geen analyse.`}
              submitLabel="Stuur de link"
              busyLabel="Versturen…"
              analytics={analytics}
              events={{ requested: "reminder_submit_requested", failed: "reminder_submit_failed", operation: "reminder_submit" }}
              onCancel={() => close("cancel")}
              onSubmit={async (email) => {
                const current = opening.current;
                setPending(true);
                try {
                  await request({
                    email,
                    catalogVersion: topic.catalogVersion,
                    goalSetKey: topic.key,
                    analyticsContext: analyticsContext(),
                  });
                  if (opening.current === current) setSent(true);
                } finally {
                  setPending(false);
                }
              }}
            />
          )}
        </Modal>
      )}
    </section>
  );
}
