"use client";
import { useEffect } from "react";
import { track } from "../lib/analytics";

const sources: Record<string, { email_kind: string; sequence_step?: number }> = {
  herinnering: { email_kind: "reminder" },
  "welkom-1": { email_kind: "welcome", sequence_step: 1 },
  "welkom-2": { email_kind: "welcome", sequence_step: 2 },
  "welkom-3": { email_kind: "welcome", sequence_step: 3 },
};

/** Links in Krito's e-mails carry ?via=…: count the visit, then drop it from the address bar. */
export function EmailLinkTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const via = url.searchParams.get("via");
    if (!via) return;
    const source = sources[via];
    if (source) track("email_link_opened", { ...source, subject_key: url.searchParams.get("onderwerp") ?? undefined });
    url.searchParams.delete("via");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
