import { Suspense } from "react";
import { AnalysisResults } from "@/components/AnalysisResults";
import { ResultsShell } from "@/components/ResultsShell";
import { ResultsPending } from "@/components/ResultsPending";

export default function ResultsPage() {
  return (
    <ResultsShell>
      <Suspense fallback={<ResultsPending />}>
        <AnalysisResults />
      </Suspense>
    </ResultsShell>
  );
}
