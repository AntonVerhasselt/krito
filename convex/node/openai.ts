"use node";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type {
  Response,
  ResponseInputContent,
} from "openai/resources/responses/responses";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runArgs } from "../workflow";
import { signedGet } from "./storage";
import {
  AnalysisOutput,
  PRIMARY_MODEL,
  RECHECK_MODEL,
  type GoalResult,
} from "../../shared/analysisSchema";
import { validateAnalysis } from "../../shared/validateAnalysis";
import { ANALYSIS_PROMPT_V1 } from "../../shared/prompts";

function client() {
  if (
    process.env.APP_ENV !== "development" ||
    process.env.AI_PRIMARY_MODEL !== PRIMARY_MODEL ||
    process.env.AI_RECHECK_MODEL !== RECHECK_MODEL
  )
    throw new Error("provider_configuration");
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    maxRetries: 0,
    timeout: 45_000,
  });
}
type RunArgs = { runId: Id<"aiRuns">; generation: number };
async function start(ctx: ActionCtx, args: RunArgs) {
  const saved = await ctx.runMutation(internal.workflow.claimCreate, args);
  if (!saved) return;
  let creating = false;
  try {
    if (saved.testMode === "deterministic") {
      if (process.env.APP_ENV !== "development")
        throw new Error("provider_configuration");
      await ctx.runMutation(internal.workflow.responseCreated, {
        ...args,
        responseId: `fixture:${saved.stage}:${saved.fixtureFails ? "fail" : "ok"}:${args.generation}`,
      });
      return;
    }
    const openai = client();
    const content: ResponseInputContent[] = [
      {
        type: "input_text",
        text: JSON.stringify({ goals: saved.goals, manifest: saved.manifest }),
      },
    ];
    for (const file of saved.manifest) {
      const sealed = saved.files.find((f) => f.fileId === file.fileId)!;
      content.push({
        type: "input_text",
        text: `PDF fileId=${file.fileId}; filename=${JSON.stringify(file.name)}; pages=${file.pageCount}.`,
      });
      content.push({
        type: "input_file",
        file_url: await signedGet(sealed.sealedKey, 15 * 60),
        detail: "auto",
      });
    }
    creating = true;
    const response = await openai.responses.create({
      model: saved.model,
      background: true,
      store: true,
      input: [
        { role: "system", content: ANALYSIS_PROMPT_V1 },
        { role: "user", content },
      ],
      text: { format: zodTextFormat(AnalysisOutput, "goal_coverage") },
    });
    // Once sent, a failed ID save is ambiguous. Recovery must not resubmit automatically.
    const accepted = await ctx.runMutation(internal.workflow.responseCreated, {
      ...args,
      responseId: response.id,
    });
    if (!accepted) {
      await openai.responses.cancel(response.id).catch(() => {});
      await openai.responses.delete(response.id).catch(() => {});
    }
  } catch (error) {
    const classification = classify(error, creating);
    await ctx.runMutation(internal.workflow.failed, {
      ...args,
      ...classification,
    });
  }
}
export const startInitialAnalysis = internalAction({
  args: runArgs,
  handler: start,
});
export const startRecheck = internalAction({ args: runArgs, handler: start });

function classify(error: unknown, creating: boolean) {
  if (error instanceof OpenAI.APIError && error.status) {
    if (error.status === 401 || error.status === 403)
      return {
        code: "provider_credentials",
        retryable: false,
        interrupted: false,
      };
    if (error.status === 429 || error.status >= 500)
      return {
        code: "provider_transient",
        retryable: true,
        interrupted: false,
      };
    const context =
      /context|too large|token|size/i.test(error.code ?? "") ||
      /context length|maximum context|too large/i.test(error.message);
    return {
      code: context ? "request_too_large" : "provider_request_rejected",
      retryable: false,
      interrupted: false,
    };
  }
  return {
    code: creating ? "creation_interrupted" : "provider_configuration",
    retryable: false,
    interrupted: creating,
  };
}
function completedText(response: Response) {
  if (response.status !== "completed") throw new Error("invalid_output");
  let text = "";
  for (const item of response.output) {
    if (item.type !== "message" || item.status !== "completed") continue;
    for (const content of item.content) {
      if (content.type === "refusal") throw new Error("provider_refusal");
      if (content.type === "output_text") text += content.text;
    }
  }
  if (!text) throw new Error("invalid_output");
  return JSON.parse(text) as unknown;
}
export const poll = internalAction({
  args: runArgs,
  handler: async (ctx, args) => {
    const saved = await ctx.runMutation(internal.workflow.claimPoll, args);
    if (!saved) return;
    if (Date.now() >= saved.deadline) {
      await ctx.runMutation(internal.workflow.failed, {
        ...args,
        code: "provider_timeout",
        retryable: false,
        interrupted: true,
      });
      return;
    }
    if (saved.testMode === "deterministic") {
      if (saved.responseId.includes(":fail:")) {
        await ctx.runMutation(internal.workflow.failed, {
          ...args,
          code: "provider_transient",
          retryable: true,
          interrupted: false,
        });
        return;
      }
      if (saved.pollCount === 0) {
        await ctx.runMutation(internal.workflow.pollAgain, {
          ...args,
          transportFailure: false,
        });
        return;
      }
      const results: GoalResult[] = saved.goalIds.map((goalId, index) => ({
        goalId,
        status: "covered",
        confidence:
          saved.stage === "initial" ? ([88, 59, 60, 35][index] ?? 88) : 70,
        confidenceReason: "Deterministische ontwikkelfixture.",
        explanation: "Fixture voor de workflow, geen inhoudelijke beoordeling.",
        evidence: [
          {
            fileId: saved.manifest[index % saved.manifest.length].fileId,
            page: 1,
            kind: "text",
            quote: "Krito testmateriaal",
            description: "Ontwikkelfixture",
          },
        ],
        missingRequirements: [],
      }));
      await ctx.runMutation(internal.workflow.accepted, { ...args, results });
      return;
    }
    let response: Response;
    try {
      response = await client().responses.retrieve(saved.responseId);
    } catch (error) {
      if (
        error instanceof OpenAI.APIError &&
        [401, 403, 404].includes(error.status ?? 0)
      ) {
        await ctx.runMutation(internal.workflow.failed, {
          ...args,
          code:
            error.status === 404
              ? "provider_response_unavailable"
              : "provider_credentials",
          retryable: false,
          interrupted: false,
        });
      } else
        await ctx.runMutation(internal.workflow.pollAgain, {
          ...args,
          transportFailure: true,
        });
      return;
    }
    if (response.status === "queued" || response.status === "in_progress") {
      await ctx.runMutation(internal.workflow.pollAgain, {
        ...args,
        transportFailure: false,
      });
      return;
    }
    if (response.status !== "completed") {
      const code = response.error?.code ?? "";
      const transient =
        response.status === "failed" &&
        ["server_error", "rate_limit_exceeded"].includes(code);
      await ctx.runMutation(internal.workflow.failed, {
        ...args,
        code: transient
          ? "provider_transient"
          : response.status === "incomplete"
            ? "request_too_large"
            : "provider_request_rejected",
        retryable: transient,
        interrupted: false,
      });
      return;
    }
    let valid: AnalysisOutput;
    try {
      valid = validateAnalysis(
        completedText(response),
        saved.goalIds,
        saved.manifest,
      );
    } catch (error) {
      const refusal =
        error instanceof Error && error.message === "provider_refusal";
      await ctx.runMutation(internal.workflow.failed, {
        ...args,
        code: refusal ? "provider_refusal" : "invalid_output",
        retryable: !refusal,
        interrupted: false,
      });
      return;
    }
    try {
      await ctx.runMutation(internal.workflow.accepted, {
        ...args,
        results: valid.results,
      });
    } catch {
      // Persistence errors retrieve the same completed response rather than generating again.
      await ctx.runMutation(internal.workflow.pollAgain, {
        ...args,
        transportFailure: true,
      });
    }
  },
});
export const discardResponse = internalAction({
  args: { responseId: v.string(), cancel: v.boolean() },
  handler: async (_, args) => {
    if (args.responseId.startsWith("fixture:")) return;
    const openai = client();
    if (args.cancel)
      await openai.responses.cancel(args.responseId).catch(() => {});
    await openai.responses.delete(args.responseId).catch(() => {});
  },
});
