import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { validateAnalysis } from "../shared/validateAnalysis";
export const inspect = internalQuery({
  args: { analysisId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("analyses", args.analysisId);
    const a = id ? await ctx.db.get(id) : null;
    if (!a) return null;
    const goals = await ctx.db
      .query("analysisGoals")
      .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
      .collect();
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_analysis_attempt_order", (q) => q.eq("analysisId", a._id))
      .collect();
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    let structurallyValid = false;
    if (a.status === "completed") {
      validateAnalysis(
        { results: goals.map((g) => g.finalResult) },
        a.goalIds,
        a.manifest!,
      );
      structurallyValid = true;
    }
    return {
      status: a.status,
      topic: a.topic,
      createdAt: a.createdAt,
      submittedAt: a.submittedAt ?? null,
      completedAt: a.completedAt ?? null,
      attempt: a.attempt,
      recheckTotal: a.recheckTotal,
      recheckCompleted: a.recheckCompleted,
      safeError: a.safeError ?? null,
      structurallyValid,
      files: files
        .filter((f) => a.manifest?.some((m) => m.fileId === f._id))
        .map((f) => ({
          fileId: f._id,
          name: f.name,
          bytes: f.actualBytes,
          pageCount: f.pageCount,
          sha256: f.sha256,
          sealed: !!f.sealedKey,
        })),
      goals: goals.map((g) => ({
        snapshot: g.snapshot,
        lunaResult: g.lunaResult ?? null,
        finalResult: g.finalResult ?? null,
        modelUsed: g.modelUsed ?? null,
        needsReview: g.needsReview,
        reviewReason: g.reviewReason ?? null,
      })),
      runs: runs.map((r) => ({
        attempt: r.attempt,
        generation: r.generation,
        stage: r.stage,
        goalId: r.goalId ?? null,
        status: r.status,
        retryCount: r.retryCount,
        pollCount: r.pollCount,
        pollFailures: r.pollFailures,
        safeError: r.safeError ?? null,
        requestShape: r.requestShape ?? null,
      })),
    };
  },
});
