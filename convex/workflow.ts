import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { fileKeys } from "./files";
import type { Doc, Id } from "./_generated/dataModel";
import { result } from "./analysisValidators";
import { validateAnalysis, isCurrentRun } from "../shared/validateAnalysis";
import {
  PRIMARY_MODEL,
  RECHECK_BELOW_CONFIDENCE,
  RECHECK_MODEL,
} from "../shared/analysisSchema";

const analysisArgs = { analysisId: v.id("analyses"), attempt: v.number() };
export const runArgs = { runId: v.id("aiRuns"), generation: v.number() };
async function active(
  ctx: MutationCtx,
  runId: Id<"aiRuns">,
  generation: number,
) {
  const run = await ctx.db.get(runId);
  if (!run) return null;
  const a = await ctx.db.get(run.analysisId);
  return a &&
    ["checking", "rechecking"].includes(a.status) &&
    isCurrentRun(a.attempt, run, run.attempt, generation)
    ? { run, a }
    : null;
}
async function insertRun(
  ctx: MutationCtx,
  a: Doc<"analyses">,
  stage: "initial" | "recheck",
  order: number,
  goalId?: string,
) {
  const runId = await ctx.db.insert("aiRuns", {
    analysisId: a._id,
    attempt: a.attempt,
    generation: 1,
    stage,
    goalId,
    order,
    status: "pending",
    retryCount: 0,
    pollCount: 0,
    pollFailures: 0,
    deadline: Date.now() + 20 * 60_000,
    updatedAt: Date.now(),
  });
  return runId;
}
export const begin = internalMutation({
  args: analysisArgs,
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.analysisId);
    if (a?.status !== "queued" || a.attempt !== args.attempt) return;
    await ctx.db.patch(a._id, { status: "preparing", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.node.pdf.prepare, args);
  },
});
export const preparationContext = internalQuery({
  args: analysisArgs,
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.analysisId);
    if (a?.status !== "preparing" || a.attempt !== args.attempt) return null;
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    return {
      files: files.filter((f) => a.manifest?.some((m) => m.fileId === f._id)),
    };
  },
});
export const sealed = internalMutation({
  args: { ...analysisArgs, fileId: v.id("files"), key: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.analysisId),
      f = await ctx.db.get(args.fileId);
    if (
      a?.status !== "preparing" ||
      a.attempt !== args.attempt ||
      f?.analysisId !== a._id ||
      f.sealedKey ||
      !a.manifest?.some((m) => m.fileId === f._id)
    )
      return false;
    await ctx.db.patch(f._id, { sealedKey: args.key, updatedAt: Date.now() });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
    return true;
  },
});
export const prepared = internalMutation({
  args: analysisArgs,
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.analysisId);
    if (a?.status !== "preparing" || a.attempt !== args.attempt) return;
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    if (
      !a.manifest?.length ||
      a.manifest.some((m) => !files.find((f) => f._id === m.fileId)?.sealedKey)
    )
      return;
    await ctx.db.patch(a._id, { status: "checking", updatedAt: Date.now() });
    const runId = await insertRun(ctx, a, "initial", 0);
    await ctx.scheduler.runAfter(0, internal.node.openai.startInitialAnalysis, {
      runId,
      generation: 1,
    });
  },
});
export const preparationFailed = internalMutation({
  args: analysisArgs,
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.analysisId);
    if (a?.status !== "preparing" || a.attempt !== args.attempt) return;
    await ctx.db.patch(a._id, {
      status: "failed",
      safeError: "preparation_failed",
      updatedAt: Date.now(),
    });
  },
});
export const claimCreate = internalMutation({
  args: runArgs,
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (!state || state.run.status !== "pending") return null;
    const { a, run } = state;
    const rows = await ctx.db
      .query("analysisGoals")
      .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
      .collect();
    const goals = rows
      .filter((g) => run.stage === "initial" || g.goalId === run.goalId)
      .map((g) => g.snapshot);
    const files = (
      await ctx.db
        .query("files")
        .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
        .collect()
    ).filter((f) => a.manifest?.some((m) => m.fileId === f._id));
    if (
      !a.manifest ||
      goals.length !== (run.stage === "initial" ? a.goalIds.length : 1) ||
      files.some((f) => !f.sealedKey)
    )
      throw new Error("Incomplete saved analysis");
    const model = run.stage === "initial" ? PRIMARY_MODEL : RECHECK_MODEL;
    await ctx.db.patch(run._id, {
      status: "creating",
      deadline: Date.now() + 20 * 60_000,
      updatedAt: Date.now(),
      requestShape: {
        model,
        goalIds: goals.map((g) => g.goalId),
        fileIds: a.manifest.map((f) => f.fileId),
        detail: "auto",
      },
    });
    return {
      model,
      goals,
      manifest: a.manifest,
      files: files.map((f) => ({ fileId: f._id, sealedKey: f.sealedKey! })),
      stage: run.stage,
      testMode: a.testMode ?? null,
      fixtureFails:
        run.stage === "recheck" && a.goalIds.indexOf(run.goalId!) === 3,
      retryCount: run.retryCount,
    };
  },
});
export const responseCreated = internalMutation({
  args: { ...runArgs, responseId: v.string() },
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (!state || state.run.status !== "creating") return false;
    const scheduledPollId = await ctx.scheduler.runAfter(
      10_000,
      internal.node.openai.poll,
      { runId: args.runId, generation: args.generation },
    );
    await ctx.db.patch(args.runId, {
      responseId: args.responseId,
      status: "polling",
      scheduledPollId,
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const claimPoll = internalMutation({
  args: runArgs,
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (
      !state ||
      state.run.status !== "polling" ||
      !state.run.responseId ||
      (state.run.pollLeaseUntil ?? 0) > Date.now()
    )
      return null;
    await ctx.db.patch(args.runId, {
      pollLeaseUntil: Date.now() + 60_000,
      updatedAt: Date.now(),
    });
    return {
      responseId: state.run.responseId,
      goalIds:
        state.run.stage === "initial" ? state.a.goalIds : [state.run.goalId!],
      manifest: state.a.manifest!,
      stage: state.run.stage,
      testMode: state.a.testMode ?? null,
      retryCount: state.run.retryCount,
      pollCount: state.run.pollCount,
      deadline: state.run.deadline,
    };
  },
});
export const pollAgain = internalMutation({
  args: { ...runArgs, transportFailure: v.boolean() },
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (!state || state.run.status !== "polling") return;
    const failures = state.run.pollFailures + (args.transportFailure ? 1 : 0);
    if (Date.now() >= state.run.deadline || failures >= 8) {
      await finishFailure(
        ctx,
        state.a,
        state.run,
        "provider_timeout",
        false,
        true,
      );
      return;
    }
    const pollCount = state.run.pollCount + 1;
    const scheduledPollId = await ctx.scheduler.runAfter(
      Math.min(30_000, 10_000 + pollCount * 2_000),
      internal.node.openai.poll,
      { runId: args.runId, generation: args.generation },
    );
    await ctx.db.patch(args.runId, {
      pollCount,
      pollFailures: failures,
      pollLeaseUntil: undefined,
      scheduledPollId,
      updatedAt: Date.now(),
    });
  },
});
async function advance(ctx: MutationCtx, a: Doc<"analyses">) {
  const runs = await ctx.db
    .query("aiRuns")
    .withIndex("by_analysis_attempt_order", (q) =>
      q.eq("analysisId", a._id).eq("attempt", a.attempt),
    )
    .collect();
  const next = runs.find(
    (r) => r.stage === "recheck" && r.status === "pending",
  );
  if (next) {
    await ctx.scheduler.runAfter(0, internal.node.openai.startRecheck, {
      runId: next._id,
      generation: next.generation,
    });
    return;
  }
  if (
    runs.some(
      (r) =>
        r.stage === "recheck" && ["creating", "polling"].includes(r.status),
    )
  )
    return;
  const goals = await ctx.db
    .query("analysisGoals")
    .withIndex("by_analysis_order", (q) => q.eq("analysisId", a._id))
    .collect();
  validateAnalysis(
    { results: goals.map((g) => g.finalResult) },
    a.goalIds,
    a.manifest!,
  );
  await ctx.db.patch(a._id, {
    status: "completed",
    updatedAt: Date.now(),
    completedAt: Date.now(),
  });
}
async function finishFailure(
  ctx: MutationCtx,
  a: Doc<"analyses">,
  run: Doc<"aiRuns">,
  code: string,
  retryable: boolean,
  interrupted: boolean,
) {
  if (retryable && run.retryCount < 2 && !interrupted) {
    const generation = run.generation + 1;
    await ctx.db.patch(run._id, {
      generation,
      status: "pending",
      responseId: undefined,
      pollLeaseUntil: undefined,
      retryCount: run.retryCount + 1,
      pollCount: 0,
      pollFailures: 0,
      safeError: code,
      deadline: Date.now() + 20 * 60_000,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      5_000 * (run.retryCount + 1),
      run.stage === "initial"
        ? internal.node.openai.startInitialAnalysis
        : internal.node.openai.startRecheck,
      { runId: run._id, generation },
    );
    return;
  }
  await ctx.db.patch(run._id, {
    status: interrupted ? "interrupted" : "failed",
    safeError: code,
    pollLeaseUntil: undefined,
    updatedAt: Date.now(),
  });
  if (run.stage === "initial")
    await ctx.db.patch(a._id, {
      status: "failed",
      safeError: code,
      updatedAt: Date.now(),
    });
  else {
    const goal = await ctx.db
      .query("analysisGoals")
      .withIndex("by_analysis_goal", (q) =>
        q.eq("analysisId", a._id).eq("goalId", run.goalId!),
      )
      .unique();
    if (!goal?.lunaResult) throw new Error("Missing initial result");
    await ctx.db.patch(goal._id, {
      finalResult: goal.lunaResult,
      modelUsed: PRIMARY_MODEL,
      needsReview: true,
      reviewReason: "recheck_failed",
    });
    await ctx.db.patch(a._id, {
      recheckCompleted: a.recheckCompleted + 1,
      updatedAt: Date.now(),
    });
    await advance(ctx, a);
  }
  if (run.responseId)
    await ctx.scheduler.runAfter(0, internal.node.openai.discardResponse, {
      responseId: run.responseId,
      cancel: interrupted,
    });
}
export const failed = internalMutation({
  args: {
    ...runArgs,
    code: v.string(),
    retryable: v.boolean(),
    interrupted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (!state) return;
    // An uncertain response-ID save can have committed. Keep polling that known ID.
    if (
      args.interrupted &&
      state.run.status === "polling" &&
      state.run.responseId &&
      args.code === "creation_interrupted"
    )
      return;
    if (state.run.responseId && args.retryable)
      await ctx.scheduler.runAfter(0, internal.node.openai.discardResponse, {
        responseId: state.run.responseId,
        cancel: false,
      });
    await finishFailure(
      ctx,
      state.a,
      state.run,
      args.code,
      args.retryable,
      args.interrupted,
    );
  },
});
export const accepted = internalMutation({
  args: { ...runArgs, results: v.array(result) },
  handler: async (ctx, args) => {
    const state = await active(ctx, args.runId, args.generation);
    if (!state || state.run.status !== "polling") return false;
    const { a, run } = state;
    const ids = run.stage === "initial" ? a.goalIds : [run.goalId!];
    const validated = validateAnalysis(
      { results: args.results },
      ids,
      a.manifest!,
    );
    await ctx.db.patch(run._id, {
      status: "completed",
      pollLeaseUntil: undefined,
      updatedAt: Date.now(),
    });
    for (const r of validated.results) {
      const goal = await ctx.db
        .query("analysisGoals")
        .withIndex("by_analysis_goal", (q) =>
          q.eq("analysisId", a._id).eq("goalId", r.goalId),
        )
        .unique();
      if (!goal) throw new Error("Missing saved goal");
      if (run.stage === "initial")
        await ctx.db.patch(goal._id, {
          lunaResult: r,
          finalResult: r,
          modelUsed: PRIMARY_MODEL,
          needsReview: false,
          reviewReason: undefined,
        });
      else
        await ctx.db.patch(goal._id, {
          finalResult: r,
          modelUsed: RECHECK_MODEL,
          needsReview: r.confidence < RECHECK_BELOW_CONFIDENCE,
          reviewReason:
            r.confidence < RECHECK_BELOW_CONFIDENCE ? "low_confidence" : undefined,
        });
    }
    if (run.stage === "initial") {
      const rechecks = validated.results.filter(
        (r) => r.confidence < RECHECK_BELOW_CONFIDENCE,
      );
      for (const [order, r] of rechecks.entries())
        await insertRun(ctx, a, "recheck", order + 1, r.goalId);
      await ctx.db.patch(a._id, {
        status: rechecks.length ? "rechecking" : "checking",
        recheckTotal: rechecks.length,
        updatedAt: Date.now(),
      });
    } else
      await ctx.db.patch(a._id, {
        recheckCompleted: a.recheckCompleted + 1,
        updatedAt: Date.now(),
      });
    await advance(ctx, a);
    if (run.responseId)
      await ctx.scheduler.runAfter(0, internal.node.openai.discardResponse, {
        responseId: run.responseId,
        cancel: false,
      });
    return true;
  },
});
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of ["queued", "preparing"] as const) {
      const jobs = await ctx.db
        .query("analyses")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", status).lt("updatedAt", now - 120_000),
        )
        .take(40);
      for (const a of jobs) {
        if (a.recoveryCount >= 3) {
          await ctx.db.patch(a._id, {
            status: "failed",
            safeError: "preparation_failed",
            updatedAt: now,
          });
          continue;
        }
        await ctx.db.patch(a._id, {
          recoveryCount: a.recoveryCount + 1,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(
          0,
          status === "queued"
            ? internal.workflow.begin
            : internal.node.pdf.prepare,
          { analysisId: a._id, attempt: a.attempt },
        );
      }
    }
    for (const status of ["pending", "creating", "polling"] as const) {
      const runs = await ctx.db
        .query("aiRuns")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", status).lt("updatedAt", now - 120_000),
        )
        .take(40);
      for (const run of runs) {
        const a = await ctx.db.get(run.analysisId);
        if (
          !a ||
          a.attempt !== run.attempt ||
          !["checking", "rechecking"].includes(a.status)
        )
          continue;
        // Pending rechecks are deliberately sequential.
        const siblings = await ctx.db
          .query("aiRuns")
          .withIndex("by_analysis_attempt_order", (q) =>
            q.eq("analysisId", a._id).eq("attempt", a.attempt),
          )
          .collect();
        if (
          status === "pending" &&
          siblings.some(
            (r) =>
              r.order < run.order &&
              ["pending", "creating", "polling"].includes(r.status),
          )
        )
          continue;
        if (status === "creating" && !run.responseId) {
          await finishFailure(ctx, a, run, "creation_interrupted", false, true);
          continue;
        }
        await ctx.db.patch(run._id, {
          updatedAt: now,
          pollLeaseUntil: undefined,
        });
        await ctx.scheduler.runAfter(
          0,
          status === "polling"
            ? internal.node.openai.poll
            : run.stage === "initial"
              ? internal.node.openai.startInitialAnalysis
              : internal.node.openai.startRecheck,
          { runId: run._id, generation: run.generation },
        );
      }
    }
    const files = await ctx.db
      .query("files")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "validating").lt("updatedAt", now - 120_000),
      )
      .take(40);
    for (const f of files) {
      if ((f.validationRetries ?? 0) >= 2) {
        await ctx.db.patch(f._id, {
          status: "invalid",
          safeError: "upload_validation_failed",
          updatedAt: now,
        });
        continue;
      }
      const generation = f.validationGeneration + 1;
      await ctx.db.patch(f._id, {
        updatedAt: now,
        validationRetries: (f.validationRetries ?? 0) + 1,
        validationGeneration: generation,
      });
      await ctx.scheduler.runAfter(0, internal.node.pdf.validateFile, {
        fileId: f._id,
        generation,
      });
    }
  },
});
export const cleanDrafts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const drafts = await ctx.db
      .query("analyses")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "draft").lt("updatedAt", Date.now() - 24 * 60 * 60_000),
      )
      .take(40);
    for (const a of drafts) {
      const files = await ctx.db
        .query("files")
        .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
        .collect();
      await ctx.scheduler.runAfter(0, internal.node.pdf.deleteObjects, {
        keys: files.flatMap(fileKeys),
      });
      for (const f of files) await ctx.db.delete(f._id);
      await ctx.db.delete(a._id);
    }
  },
});
