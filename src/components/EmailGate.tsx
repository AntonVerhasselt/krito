"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { AnalysisSession } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
export function EmailGate({
  session,
  onBack,
}: {
  session: AnalysisSession;
  onBack: () => void;
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
      <label className="field-label" htmlFor="analysis-email">
        Je e-mailadres
      </label>
      <input
        id="analysis-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        disabled={busy}
        placeholder="jij@school.be"
        onChange={(e) => setEmail(e.target.value)}
      />
      <p className="field-hint">
        Je resultaat verschijnt hier op de website. Bewaar dit tabblad; we
        sturen geen resultaat per e-mail.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? "Analyse starten…" : "Start de analyse →"}
      </button>
      <button
        className="text-button"
        type="button"
        disabled={busy}
        onClick={onBack}
      >
        ← Terug naar materiaal
      </button>
    </form>
  );
}
