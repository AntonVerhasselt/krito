import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
function developmentOnly() {
  if (process.env.APP_ENV !== "development")
    throw new Error("Development fixtures only");
}
// Only authenticated developer CLI calls can opt a specific draft into fixture mode.
export const markFixture = internalMutation({
  args: { analysisId: v.id("analyses"), deterministic: v.boolean() },
  handler: async (ctx, args) => {
    developmentOnly();
    const a = await ctx.db.get(args.analysisId);
    if (a?.status !== "draft")
      throw new Error("Fixture must be an unsubmitted draft");
    await ctx.db.patch(a._id, {
      testMode: args.deterministic ? "deterministic" : undefined,
      fixture: "development-smoke",
    });
  },
});
export const audit = internalQuery({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    developmentOnly();
    const a = await ctx.db.get(args.analysisId);
    if (a?.fixture !== "development-smoke") throw new Error("Unmarked fixture");
    const rows = await ctx.db
      .query("analysisGoals")
      .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
      .collect();
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_analysis_attempt_order", (q) => q.eq("analysisId", a._id))
      .collect();
    const profile = a.userId ? await ctx.db.get(a.userId) : null;
    return {
      status: a.status,
      attempt: a.attempt,
      goalIds: a.goalIds,
      recheckTotal: a.recheckTotal,
      recheckCompleted: a.recheckCompleted,
      safeError: a.safeError ?? null,
      profile: {
        linked: !!profile,
        emailVerified: profile?.emailVerified ?? false,
        legacyEmailPresent: !!a.email,
        hasPlusTag: profile?.email.includes("+") ?? false,
      },
      goals: rows.map((g) => ({
        goalId: g.goalId,
        wording: g.snapshot.wording,
        lunaResult: g.lunaResult ?? null,
        finalResult: g.finalResult ?? null,
        modelUsed: g.modelUsed ?? null,
        needsReview: g.needsReview,
        reviewReason: g.reviewReason ?? null,
      })),
      runs: runs.map((r) => ({
        runId: r._id,
        generation: r.generation,
        stage: r.stage,
        goalId: r.goalId ?? null,
        status: r.status,
        retryCount: r.retryCount,
        requestShape: r.requestShape ?? null,
      })),
    };
  },
});
export const cleanup = internalMutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args) => {
    developmentOnly();
    const a = await ctx.db.get(args.analysisId);
    if (!a) return;
    if (a.fixture !== "development-smoke")
      throw new Error("Refusing to delete an unmarked analysis");
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    await ctx.scheduler.runAfter(0, internal.node.pdf.deleteObjects, {
      keys: files.flatMap((f) =>
        f.sealedKey ? [f.stagingKey, f.sealedKey] : [f.stagingKey],
      ),
    });
    for (const table of ["analysisGoals", "aiRuns"] as const) {
      const children =
        table === "analysisGoals"
          ? await ctx.db
              .query("analysisGoals")
              .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
              .collect()
          : await ctx.db
              .query("aiRuns")
              .withIndex("by_analysis_attempt_order", (q) =>
                q.eq("analysisId", a._id),
              )
              .collect();
      for (const child of children) await ctx.db.delete(child._id);
    }
    for (const f of files) await ctx.db.delete(f._id);
    await ctx.db.delete(a._id);
    if (a.userId) {
      const referenced = await ctx.db
        .query("analyses")
        .withIndex("by_user", (q) => q.eq("userId", a.userId))
        .first();
      const user = await ctx.db.get(a.userId);
      if (!referenced && user && !user.authId) await ctx.db.delete(user._id);
    }
  },
});
