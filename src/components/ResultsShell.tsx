import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { NewAnalysisLink } from "./NewAnalysisLink";

/** Keep navigation in the static shell while private results resolve. */
export function ResultsShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell results-shell">
      <SiteHeader><NewAnalysisLink /></SiteHeader>
      <main className="results">{children}</main>
    </div>
  );
}
