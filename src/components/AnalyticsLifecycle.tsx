"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAccessToken, useAnalysisSession } from "../lib/analysisSession";
import type { AnalysisSession } from "../lib/analysisSession";
import { analyticsContext, getAnalyticsConsent, identifyContact, subscribeAnalyticsConsent } from "../lib/analytics";

/** Consent changes also apply to background work after the browser leaves. */
export function AnalyticsLifecycle() {
  const active = useAnalysisSession();
  const { analysisId } = useParams<{ analysisId?: string }>();
  const accessToken = useAccessToken(analysisId ?? "");
  const session = useMemo(() => analysisId && /^[a-z0-9]{10,80}$/.test(analysisId) && accessToken
    ? { analysisId, accessToken } : active, [analysisId, accessToken, active]);
  const status = useQuery(api.analyses.getStatus, session ?? "skip");
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => "unknown" as const);
  const setConsent = useMutation(api.analyses.setAnalyticsConsent);
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    const context = consent === "granted" ? analyticsContext() : undefined;
    const sessions: AnalysisSession[] = session ? [session] : [];
    // A teacher can start another analysis while an earlier job still runs.
    // Withdrawal applies to every analysis this tab is authorized to access.
    if (consent !== "granted") {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (!key?.startsWith("krito-access-")) continue;
          const analysisId = key.slice("krito-access-".length);
          const accessToken = sessionStorage.getItem(key);
          if (accessToken && /^[a-f0-9]{64}$/.test(accessToken) && !sessions.some((s) => s.analysisId === analysisId)) sessions.push({ analysisId, accessToken });
        }
      } catch { /* Storage access is optional for analytics. */ }
    }
    if (!sessions.length) return;
    // Serialize rapid grant/revoke changes; the most recent decision must win.
    pending.current = pending.current.catch(() => {}).then(async () => {
      for (const credentials of sessions) {
        try { await setConsent({ ...credentials, analyticsContext: context }); }
        catch { /* A stale/private session or telemetry outage never blocks the app. */ }
      }
    });
  }, [consent, session, setConsent]);
  useEffect(() => {
    if (consent === "granted" && status?.analyticsDistinctId) identifyContact(status.analyticsDistinctId);
  }, [consent, status?.analyticsDistinctId]);
  return null;
}
