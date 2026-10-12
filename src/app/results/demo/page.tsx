import { DemoResults } from "@/components/AnalysisResults";
import { ResultsShell } from "@/components/ResultsShell";

export default function DemoPage() {
  return <ResultsShell><DemoResults running={false} /></ResultsShell>;
}
