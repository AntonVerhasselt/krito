"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import photo from "../../public/anton-arthur.webp";
import { analyticsAvailable, getAnalyticsConsent, setAnalyticsConsent, subscribeAnalyticsConsent } from "../lib/analytics";

/** How long the thank-you stays once it is fully written, then the note slides away. */
const THANKS_MS = 2000;
const WRITTEN_MS = 1100;
const LEAVE_MS = 300;

/** A hand-drawn ring, drawn around the photo when someone says yes. */
function PenRing() {
  return (
    <svg className="consent-ring" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M55 5C29 3 6 21 6 49c0 26 20 46 46 45 25-1 43-20 42-45C93 24 74 7 50 7 38 7 28 11 21 18" pathLength={1} />
    </svg>
  );
}

export function AnalyticsConsent() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => "unknown" as const);
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<"ask" | "thanks" | "leaving">("ask");

  useEffect(() => {
    if (stage === "ask") return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => {
      if (stage === "thanks") { setStage("leaving"); return; }
      setStage("ask");
      setEditing(false);
    }, stage === "thanks" ? THANKS_MS + (still ? 0 : WRITTEN_MS) : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  if (!analyticsAvailable()) return null;
  if (consent !== "unknown" && !editing && stage === "ask") return (
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
    if (choice === "granted") setStage("thanks");
    else setEditing(false);
  }

  const asking = stage === "ask";
  return (
    <aside className={`analytics-consent is-${stage}`} aria-label="Privacykeuze">
      <div className="consent-photo">
        <Image src={photo} alt="Anton met zijn zoon Arthur" sizes="112px" />
        {!asking && <PenRing />}
      </div>
      {asking ? (
        <div className="consent-note">
          <h2>Mag ik je iets vragen?</h2>
          <p>
            Ik ben Anton, papa van Charlotte en Arthur, de kleine naast mij op
            de foto. Ik maak Krito zodat jij minder werk hebt naast de klas.
          </p>
          <p>
            Mag Krito cookies gebruiken? Zo zie ik wat goed werkt en wat beter
            kan, en wordt Krito steeds handiger voor jou en je collega&apos;s.
            Je kunt je keuze altijd aanpassen.
          </p>
          <p className="consent-sign">Anton</p>
          <div className="analytics-consent-actions">
            <button className="primary-button" type="button" onClick={() => choose("granted")}>Ja, dat mag</button>
            <button className="consent-decline" type="button" onClick={() => choose("denied")}>Nee, bedankt</button>
            <Link href="/privacy" className="consent-more" aria-label="Meer over je gegevens" title="Meer over je gegevens">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 6.1a2.1 2.1 0 1 1 3 1.9c-.6.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="12.2" r="0.9" fill="currentColor" />
              </svg>
            </Link>
          </div>
        </div>
      ) : (
        <div className="consent-thanks" role="status">
          <p className="consent-merci">Merci!</p>
          <p>Daar help je Krito echt mee vooruit.</p>
        </div>
      )}
    </aside>
  );
}
