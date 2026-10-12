"use client";
import { useRef, useState, type ReactNode } from "react";
import { track, captureAnalyticsError } from "../lib/analytics";
import { analyticsErrorCode, type AnalyticsEvent, type AnalyticsProperties } from "../../shared/analytics";
import { safeError } from "../lib/safeError";
import { isPersonalEmail } from "../../shared/emailPolicy";
import { StatusIcon } from "./brand";

/**
 * The school address field with the same rules everywhere it appears: the
 * analysis modal and the mobile "stuur dit naar mezelf" modal.
 */
export function SchoolEmailForm({
  id,
  title,
  lead,
  submitLabel,
  busyLabel,
  analytics,
  events,
  onSubmit,
  onCancel,
}: {
  id: string;
  title: string;
  lead: ReactNode;
  submitLabel: string;
  busyLabel: string;
  analytics: AnalyticsProperties;
  events: { requested: AnalyticsEvent; failed: AnalyticsEvent; operation: string };
  onSubmit: (email: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const typingStarted = useRef(false);
  return (
    <form
      className="email-gate"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (isPersonalEmail(email)) {
          track("email_validation_failed", { ...analytics, reason: "personal_email" });
          setError(safeError("personal_email"));
          return;
        }
        track(events.requested, analytics);
        setBusy(true);
        setError("");
        try {
          await onSubmit(email);
        } catch (e) {
          track(events.failed, { ...analytics, error_code: analyticsErrorCode(e) });
          captureAnalyticsError(e, events.operation, analytics);
          setError(safeError(e));
          setBusy(false);
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button type="button" className="icon-button" aria-label="Sluit" disabled={busy} onClick={onCancel}>
          ×
        </button>
      </div>
      <p className="email-gate-lead">{lead}</p>
      <label className="field-label" htmlFor={id}>
        Je e-mailadres van school
      </label>
      <input
        id={id}
        className="text-input"
        type="email"
        autoComplete="email"
        data-autofocus
        required
        maxLength={254}
        value={email}
        disabled={busy}
        placeholder="naam@jouwschool.be"
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-notice${error ? ` ${id}-error` : ""}`}
        onInvalid={() => track("email_validation_failed", { ...analytics, reason: "invalid_email" })}
        onChange={(e) => {
          if (e.target.value && !typingStarted.current) {
            typingStarted.current = true;
            track("email_typing_started", analytics);
          }
          setEmail(e.target.value);
          if (error) setError("");
        }}
      />
      {error && (
        <p className="form-error" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
      <p className="email-notice" id={`${id}-notice`}>
        Je krijgt ook drie korte mails van mij over hoe Krito werkt. Uitschrijven kan altijd. — Anton
      </p>
      <div className="email-actions">
        <button className="text-button" type="button" disabled={busy} onClick={onCancel}>
          Annuleer
        </button>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <StatusIcon status="loading" size={22} /> {busyLabel}
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
