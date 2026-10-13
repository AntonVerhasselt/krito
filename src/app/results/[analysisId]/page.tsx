import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisResults } from "@/components/AnalysisResults";
import { ResultsShell } from "@/components/ResultsShell";
import { ResultsPending } from "@/components/ResultsPending";
import { noIndex } from "@/lib/site";

export const metadata: Metadata = { title: "Je analyse", robots: noIndex };

export default function ResultsPage() {
  return (
    <ResultsShell>
      <Suspense fallback={<ResultsPending />}>
        <AnalysisResults />
      </Suspense>
    </ResultsShell>
  );
}
