"use client";

import Link from "next/link";
import { saveSession } from "../lib/analysisSession";
import { track } from "../lib/analytics";

export function NewAnalysisLink() {
  return (
    <Link href="/" className="back-link" onClick={() => {
      // Read URL data only on interaction so the link can be prerendered.
      track("analysis_new_clicked", { is_demo: /^\/results\/demo(?:-loopt)?\/?$/.test(window.location.pathname) });
      saveSession(null);
    }}>
      Nieuwe analyse
    </Link>
  );
}
