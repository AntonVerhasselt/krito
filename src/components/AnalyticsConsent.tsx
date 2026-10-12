"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { analyticsAvailable, getAnalyticsConsent, setAnalyticsConsent, subscribeAnalyticsConsent } from "../lib/analytics";

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => "unknown" as const);
  const [editing, setEditing] = useState(false);
  if (!analyticsAvailable()) return null;
  if (consent !== "unknown" && !editing) return (
    <button type="button" className="analytics-settings text-button" onClick={() => setEditing(true)}>
      Privacykeuze
    </button>
  );
  function choose(choice: "granted" | "denied") {
    setAnalyticsConsent(choice);
    setEditing(false);
  }
  return (
    <aside className="analytics-consent" aria-label="Privacykeuze">
      <h2 data-analytics-public="true">Help Krito verbeteren</h2>
      <p data-analytics-public="true">
        Mogen we meten hoe je Krito gebruikt en je sessie opnemen? Je invoer en lesmateriaal
        worden afgeschermd. Bij een analyse koppelen we je schoolmail aan je gebruik.
      </p>
      <div className="analytics-consent-actions">
        <button className="secondary-button" type="button" onClick={() => choose("denied")}>Nee, bedankt</button>
        <button className="secondary-button" type="button" onClick={() => choose("granted")}>Ja, dat mag</button>
        <Link href="/privacy">Meer over je gegevens</Link>
      </div>
    </aside>
  );
}
