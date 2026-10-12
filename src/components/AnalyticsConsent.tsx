"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { analyticsAvailable, getAnalyticsConsent, setAnalyticsConsent, subscribeAnalyticsConsent } from "../lib/analytics";

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => "unknown" as const);
  const [editing, setEditing] = useState(false);
  if (!analyticsAvailable()) return null;
  if (consent !== "unknown" && !editing) return (
    <button type="button" className="analytics-settings text-button" aria-label="Privacykeuze" title="Privacykeuze" onClick={() => setEditing(true)}>
      {/* On phones only the shield shows, so it stays out of the way of the page. */}
      <svg className="analytics-settings-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5 2.75 3.5v4c0 3.2 2.2 5.9 5.25 7 3.05-1.1 5.25-3.8 5.25-7v-4L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="m5.6 8 1.7 1.7 3.1-3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="analytics-settings-label">Privacykeuze</span>
    </button>
  );
  function choose(choice: "granted" | "denied") {
    setAnalyticsConsent(choice);
    setEditing(false);
  }
  return (
    <aside className="analytics-consent" aria-label="Privacykeuze">
      <h2>Help Krito verbeteren</h2>
      <p>
        Met jouw toestemming zien we wat goed werkt en waar mensen vastlopen.
        Zo help je Krito beter te maken voor jou en andere leerkrachten.
        We meten gebruik en technische gegevens, geen zoekopdrachten of lesmateriaal.
        Bij een analyse koppelen we je schoolmail aan je gebruik.
        Je kunt je keuze altijd aanpassen.
      </p>
      <div className="analytics-consent-actions">
        <button className="secondary-button" type="button" onClick={() => choose("denied")}>Nee, bedankt</button>
        <button className="secondary-button" type="button" onClick={() => choose("granted")}>Ja, dat mag</button>
        <Link href="/privacy">Meer over je gegevens</Link>
      </div>
    </aside>
  );
}
