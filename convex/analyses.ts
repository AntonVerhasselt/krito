import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorized, requireAccess } from "./access";
import { MAX_TOTAL_BYTES } from "../shared/analysisSchema";
import { resolveContact } from "./users";
import { startWelcome } from "./emails";
import { PROMPT_VERSION } from "../shared/prompts";
import { schoolEmailProblem } from "../shared/emailPolicy";
import { analyticsContextValidator, validAnalyticsContext, captureAnalysis, identifyContact } from "./analytics";

export const accessArgs = { analysisId: v.string(), accessToken: v.string() };
export async function chosenTopic(
  ctx: MutationCtx,
  catalogVersion: string,
  goalSetKey: string,
) {
  const catalog = await ctx.db
    .query("catalogs")
    .withIndex("by_version", (q) => q.eq("catalogVersion", catalogVersion))
    .unique();
  const topic = await ctx.db
    .query("goalSets")
    .withIndex("by_version_key", (q) =>
      q.eq("catalogVersion", catalogVersion).eq("key", goalSetKey),
    )
    .unique();
  if (
    catalog?.status !== "published" ||
    topic?.level !== "subdomain" ||
    !topic.goalIds.length
  )
    throw new ConvexError("invalid_topic");
  return {
    goalIds: topic.goalIds,
    topic: {
      key: topic.key,
      catalogVersion,
      title: topic.title,
      path: topic.path,
      group: topic.group,
      goalCount: topic.goalCount,
    },
  };
}
export const createDraft = mutation({
  args: {
    capabilityHash: v.string(),
    catalogVersion: v.string(),
    goalSetKey: v.string(),
    analyticsContext: v.optional(analyticsContextValidator),
  },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.capabilityHash))
      throw new ConvexError("invalid_capability");
    const selection = await chosenTopic(
      ctx,
      args.catalogVersion,
      args.goalSetKey,
    );
    const now = Date.now();
    const analysisId = await ctx.db.insert("analyses", {
      ...selection,
      capabilityHash: args.capabilityHash,
      catalogVersion: args.catalogVersion,
      goalSetKey: args.goalSetKey,
      status: "draft",
      attempt: 0,
      recheckTotal: 0,
      recheckCompleted: 0,
      recoveryCount: 0,
      createdAt: now,
      updatedAt: now,
      analyticsContext: validAnalyticsContext(args.analyticsContext),
    });
    await captureAnalysis(ctx, (await ctx.db.get(analysisId))!, "analysis_draft_created", {}, now);
    return analysisId;
  },
});
export const updateTopic = mutation({
  args: { ...accessArgs, catalogVersion: v.string(), goalSetKey: v.string() },
  handler: async (ctx, args) => {
    const analysis = await requireAccess(
      ctx,
      args.analysisId,
      args.accessToken,
    );
    if (analysis.status !== "draft") throw new ConvexError("already_submitted");
    await ctx.db.patch(analysis._id, {
      ...(await chosenTopic(ctx, args.catalogVersion, args.goalSetKey)),
      catalogVersion: args.catalogVersion,
      goalSetKey: args.goalSetKey,
      updatedAt: Date.now(),
    });
    if (analysis.goalSetKey !== args.goalSetKey)
      await captureAnalysis(ctx, (await ctx.db.get(analysis._id))!, "analysis_topic_changed", {
        previous_subject_key: analysis.goalSetKey,
      });
  },
});
export const getStatus = query({
  args: accessArgs,
  handler: async (ctx, args) => {
    const a = await authorized(ctx, args.analysisId, args.accessToken);
    if (!a) return null;
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    return {
      analysisId: a._id,
      attempt: a.attempt,
      analyticsDistinctId: a.analyticsContext?.consent && a.userId ? a.userId : null,
      status: a.status,
      topic: a.topic,
      recheckTotal: a.recheckTotal,
      recheckCompleted: a.recheckCompleted,
      safeError: a.safeError ?? null,
      files: files
        .filter((f) => f.status !== "removed")
        .map((f) => ({
          fileId: f._id,
          name: f.name,
          // The uploaded size: the browser checks it against the same limit
          // as registerUpload. Converted sizes are checked in files.validated.
          bytes: f.declaredBytes,
          pageCount: f.pageCount ?? null,
          status: f.status,
          safeError: f.safeError ?? null,
        })),
    };
  },
});
export const submit = mutation({
  args: { ...accessArgs, email: v.string(), analyticsContext: v.optional(analyticsContextValidator) },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    if (a.status !== "draft") return a._id;
    const email = args.email.trim();
    const problem = schoolEmailProblem(email);
    if (problem) throw new ConvexError(problem);
    const selection = await chosenTopic(ctx, a.catalogVersion, a.goalSetKey);
    const files = (
      await ctx.db
        .query("files")
        .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
        .collect()
    ).filter((f) => f.status !== "removed");
    if (
      !files.length ||
      files.some(
        (f) =>
          f.status !== "ready" ||
          !f.pageCount ||
          !f.actualBytes ||
          !f.sha256 ||
          !f.etag,
      ) ||
      // files.validated keeps the converted total under the limit; this
      // only guards against files that changed underneath.
      files.reduce((sum, f) => sum + (f.actualBytes ?? 0), 0) > MAX_TOTAL_BYTES
    )
      throw new ConvexError("files_not_ready");
    for (const [order, goalId] of selection.goalIds.entries()) {
      const goal = await ctx.db
        .query("goals")
        .withIndex("by_version_goal", (q) =>
          q.eq("catalogVersion", a.catalogVersion).eq("goalId", goalId),
        )
        .unique();
      if (!goal || goal.group.sourceKey !== selection.topic.group.sourceKey)
        throw new ConvexError("invalid_topic");
      const {
        wording,
        wordingText,
        clarification,
        clarificationText,
        sourceUrl,
        sourceDate,
        discipline,
        domain,
        subdomain,
        cluster,
        group,
      } = goal;
      await ctx.db.insert("analysisGoals", {
        analysisId: a._id,
        goalId,
        order,
        needsReview: false,
        snapshot: {
          goalId,
          catalogVersion: a.catalogVersion,
          wording,
          wordingText,
          clarification,
          clarificationText,
          sourceUrl,
          sourceDate,
          discipline,
          domain,
          subdomain,
          cluster,
          group,
        },
      });
    }
    const { userId, created } = await resolveContact(ctx, email);
    const now = Date.now();
    await ctx.db.patch(a._id, {
      ...selection,
      userId,
      analyticsContext: validAnalyticsContext(args.analyticsContext),
      manifest: files.map((f) => ({
        fileId: f._id,
        name: f.name,
        pageCount: f.pageCount!,
        bytes: f.actualBytes!,
      })),
      promptVersion: PROMPT_VERSION,
      attempt: 1,
      status: "queued",
      submittedAt: now,
      attemptStartedAt: now,
      updatedAt: now,
    });
    const submitted = (await ctx.db.get(a._id))!;
    await identifyContact(ctx, submitted);
    if (created) {
      await captureAnalysis(ctx, submitted, "user_profile_created", {}, now);
      // Smoke-test analyses must never start a real sequence.
      if (!a.testMode && !a.fixture) await startWelcome(ctx, userId, "analysis", submitted.analyticsContext);
    }
    await captureAnalysis(ctx, submitted, "analysis_submitted", {
      file_count: files.length, total_bytes: files.reduce((sum, f) => sum + f.actualBytes!, 0),
      page_count: files.reduce((sum, f) => sum + f.pageCount!, 0),
    }, now);
    await ctx.scheduler.runAfter(0, internal.workflow.begin, {
      analysisId: a._id,
      attempt: 1,
    });
    return a._id;
  },
});
export const getResults = query({
  args: accessArgs,
  handler: async (ctx, args) => {
    const a = await authorized(ctx, args.analysisId, args.accessToken);
    if (!a) return null;
    // While rechecking, the initial results of this attempt are saved; only
    // low-confidence goals still wait for their independent second check.
    if (a.status !== "completed" && a.status !== "rechecking")
      return { status: a.status, topic: a.topic, files: [], goals: [] };
    const rows = await ctx.db
      .query("analysisGoals")
      .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
      .collect();
    return {
      status: a.status,
      topic: a.topic,
      files: a.manifest ?? [],
      goals: rows.map((g) => {
        const settled =
          a.status === "completed" || (!!g.finalResult && !g.awaitingRecheck);
        return {
          snapshot: g.snapshot,
          result: settled ? g.finalResult! : null,
          modelUsed: settled ? g.modelUsed! : null,
          needsReview: settled && g.needsReview,
          reviewReason: settled ? (g.reviewReason ?? null) : null,
        };
      }),
    };
  },
});
export const retry = mutation({
  args: { ...accessArgs, analyticsContext: v.optional(analyticsContextValidator) },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    if (a.status !== "failed") return a._id;
    const attempt = a.attempt + 1;
    await ctx.db.patch(a._id, {
      status: "queued",
      attempt,
      safeError: undefined,
      recheckTotal: 0,
      recheckCompleted: 0,
      recoveryCount: 0,
      analyticsContext: validAnalyticsContext(args.analyticsContext),
      attemptStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await captureAnalysis(ctx, (await ctx.db.get(a._id))!, "analysis_retry_requested");
    await ctx.scheduler.runAfter(0, internal.workflow.begin, {
      analysisId: a._id,
      attempt,
    });
    return a._id;
  },
});

// A capabilities-protected consent update applies to subsequent background work.
export const setAnalyticsConsent = mutation({
  args: { ...accessArgs, analyticsContext: v.optional(analyticsContextValidator) },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    const context = validAnalyticsContext(args.analyticsContext);
    await ctx.db.patch(a._id, { analyticsContext: context });
    if (context && a.userId) await identifyContact(ctx, { ...a, analyticsContext: context });
  },
});
