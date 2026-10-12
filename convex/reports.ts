import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { authorized } from "./access";
import { RECHECK_MODEL } from "../shared/analysisSchema";
import type { ReportInput } from "../shared/report/model";

/** A finished analysis as pdf report input. Results don't change after completion. */
export async function reportInput(ctx: QueryCtx, a: Doc<"analyses">): Promise<ReportInput | null> {
  if (a.status !== "completed" || !a.manifest || !a.completedAt) return null;
  const rows = await ctx.db
    .query("analysisGoals")
    .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
    .collect();
  if (rows.some((g) => !g.finalResult)) return null;
  return {
    topic: a.topic,
    files: a.manifest,
    goals: rows.map((g) => ({
      snapshot: g.snapshot,
      result: g.finalResult!,
      rechecked: g.modelUsed === RECHECK_MODEL,
      needsReview: g.needsReview,
      reviewReason: g.reviewReason ?? null,
    })),
    completedAt: a.completedAt,
  };
}

/** For the download button: the same access check as the results page. */
export const authorizedInput = internalQuery({
  args: { analysisId: v.string(), accessToken: v.string() },
  handler: async (ctx, args) => {
    const a = await authorized(ctx, args.analysisId, args.accessToken);
    return a ? reportInput(ctx, a) : null;
  },
});
