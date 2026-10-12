import { DemoResults } from "@/components/AnalysisResults";
import { ResultsShell } from "@/components/ResultsShell";

export default function RunningDemoPage() {
  return <ResultsShell><DemoResults running /></ResultsShell>;
}
