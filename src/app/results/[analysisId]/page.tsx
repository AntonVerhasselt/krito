import { Suspense } from "react";
import { AnalysisResults } from "@/components/AnalysisResults";
export default function ResultsPage() {
  return (
    <Suspense fallback={<p>Analyse laden…</p>}>
      <AnalysisResults />
    </Suspense>
  );
}
