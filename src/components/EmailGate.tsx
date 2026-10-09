"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { AnalysisSession } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { isPersonalEmail } from "../../shared/emailPolicy";
import { StatusIcon } from "./SiteHeader";
export function EmailGate({
  session,
  onCancel,
}: {
  session: AnalysisSession;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = useMutation(api.analyses.submit);
  const router = useRouter();
  return (
    <form
      className="email-gate"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (isPersonalEmail(email)) {
          setError(safeError("personal_email"));
          return;
        }
        setBusy(true);
        setError("");
        try {
          const id = await submit({ ...session, email });
          router.push(`/results/${id}`);
        } catch (e) {
          setError(safeError(e));
          setBusy(false);
        }
      }}
    >
      <div className="modal-heading">
        <h2>Nog één ding</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Sluit"
          disabled={busy}
          onClick={onCancel}
        >
          ×
        </button>
      </div>
      <p className="email-gate-lead">
        Vul je e-mailadres in en Krito begint met nakijken. Je resultaat
        verschijnt meteen hier op de website.
      </p>
      <label className="field-label" htmlFor="analysis-email">
        Je e-mailadres van school
      </label>
      <input
        id="analysis-email"
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
        aria-describedby={error ? "analysis-email-error" : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          if (error) setError("");
        }}
      />
      {error && (
        <p className="form-error" role="alert" id="analysis-email-error">
          {error}
        </p>
      )}
      <div className="email-actions">
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Annuleer
        </button>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <StatusIcon status="loading" size={22} /> Analyse starten…
            </>
          ) : (
            "Start de analyse"
          )}
        </button>
      </div>
    </form>
  );
}
