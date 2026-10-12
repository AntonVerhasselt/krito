"use client";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";
import type { AnalysisSession } from "../lib/analysisSession";
import { analyticsContext } from "../lib/analytics";
import { SchoolEmailForm } from "./SchoolEmailForm";

export function EmailGate({ session, onCancel }: { session: AnalysisSession; onCancel: () => void }) {
  const submit = useMutation(api.analyses.submit);
  const router = useRouter();
  return (
    <SchoolEmailForm
      id="analysis-email"
      title="Nog één ding"
      lead="Vul je e-mailadres in en Krito begint met nakijken. Je resultaat verschijnt meteen hier, en je krijgt het verslag ook als pdf in je mailbox."
      submitLabel="Start de analyse"
      busyLabel="Analyse starten…"
      analytics={{ analysis_id: session.analysisId, source: "analysis" }}
      events={{ requested: "email_submit_requested", failed: "email_submit_failed", operation: "email_submit" }}
      onCancel={onCancel}
      onSubmit={async (email) => {
        const id = await submit({ ...session, email, analyticsContext: analyticsContext() });
        // Results restore analytics identity from their protected status response.
        // No extra analytics request may delay an already accepted submission.
        router.push(`/results/${id}`);
      }}
    />
  );
}
