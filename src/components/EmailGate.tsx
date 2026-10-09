"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { AnalysisSession } from "../lib/analysisSession";
import { safeError } from "../lib/safeError";
import { StatusIcon } from "./SiteHeader";
export function EmailGate({
  session,
  ready,
}: {
  session: AnalysisSession;
  ready: boolean;
}) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = useMutation(api.analyses.submit);
  const router = useRouter();
  return (
    <form
      className={`email-gate${ready ? " is-ready" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !ready) return;
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
      <h2>{ready ? "Alles staat op het bord" : "Even geduld"}</h2>
      <p className="email-gate-lead">
        {ready
          ? "Laat je e-mailadres achter en Krito begint met nakijken."
          : "Krito controleert eerst of elke pdf leesbaar is."}
      </p>
      <div className="email-row">
        <label className="visually-hidden" htmlFor="analysis-email">
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
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !ready}
        >
          {busy ? (
            <>
              <StatusIcon status="loading" size={22} /> Analyse starten…
            </>
          ) : (
            "Start de analyse"
          )}
        </button>
      </div>
      <p className="field-hint">
        Je resultaat verschijnt hier op de website. Bewaar dit tabblad; we
        sturen geen resultaat per e-mail.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
