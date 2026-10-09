import {
  AnalysisOutput,
  type FileManifest,
  type GoalResult,
} from "./analysisSchema";
export function validateAnalysis(
  input: unknown,
  goalIds: string[],
  manifest: FileManifest[],
) {
  const parsed = AnalysisOutput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid result schema");
  const expected = new Set(goalIds),
    seen = new Set<string>(),
    files = new Map(manifest.map((file) => [file.fileId, file]));
  if (
    expected.size !== goalIds.length ||
    parsed.data.results.length !== expected.size
  )
    throw new Error("Result goal set mismatch");
  for (const result of parsed.data.results) {
    if (!expected.has(result.goalId) || seen.has(result.goalId))
      throw new Error("Unknown or duplicate goal");
    seen.add(result.goalId);
    if (
      result.status === "covered" &&
      (!result.evidence.length || result.missingRequirements.length)
    )
      throw new Error("Unsupported covered result");
    if (
      result.status === "partial" &&
      (!result.evidence.length || !result.missingRequirements.length)
    )
      throw new Error("Inconsistent partial result");
    if (result.status === "not_found" && result.evidence.length)
      throw new Error("Not-found result has supporting evidence");
    for (const evidence of result.evidence) {
      const file = files.get(evidence.fileId);
      if (!file || evidence.page > file.pageCount)
        throw new Error("Citation outside the file manifest");
      if (evidence.kind === "text" && !evidence.quote?.trim())
        throw new Error("Empty text quote");
      if (evidence.kind === "visual" && !evidence.description.trim())
        throw new Error("Empty visual description");
    }
  }
  return {
    results: goalIds.map(
      (id) => parsed.data.results.find((result) => result.goalId === id)!,
    ),
  };
}
export function recheckGoalIds(results: GoalResult[]) {
  return results
    .filter((result) => result.confidence < 60)
    .map((result) => result.goalId);
}
export function mergeResults(
  initial: GoalResult[],
  replacements: Map<string, GoalResult>,
) {
  for (const [id, result] of replacements)
    if (result.goalId !== id || !initial.some((row) => row.goalId === id))
      throw new Error("Replacement goal mismatch");
  return initial.map((result) => replacements.get(result.goalId) ?? result);
}
export function isCurrentRun(
  currentAttempt: number,
  run: { attempt: number; generation: number; status: string },
  attempt: number,
  generation: number,
) {
  return (
    currentAttempt === attempt &&
    run.attempt === attempt &&
    run.generation === generation &&
    !["completed", "failed", "interrupted"].includes(run.status)
  );
}
