import type { Metadata } from "next";
import { DemoResults } from "@/components/AnalysisResults";
import { ResultsShell } from "@/components/ResultsShell";
import { noIndex } from "@/lib/site";

export const metadata: Metadata = { title: "Voorbeeldanalyse", robots: noIndex };

export default function DemoPage() {
  return <ResultsShell><DemoResults running={false} /></ResultsShell>;
}
