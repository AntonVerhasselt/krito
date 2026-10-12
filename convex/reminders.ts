import { ConvexError, v } from "convex/values";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { chosenTopic } from "./analyses";
import { resolveContact, emailKey } from "./users";
import { enqueueEmail, startWelcome } from "./emails";
import { analyticsContextValidator, captureForContact, validAnalyticsContext } from "./analytics";
import { schoolEmailProblem } from "../shared/emailPolicy";

const DAY = 24 * HOUR;
/**
 * This endpoint e-mails any school address without an upload, so it is limited
 * per address, per browser journey and in total (which also protects the quota).
 */
const limiter = new RateLimiter(components.rateLimiter, {
  reminderPerAddress: { kind: "fixed window", rate: 3, period: DAY },
  reminderPerJourney: { kind: "fixed window", rate: 5, period: HOUR },
  reminderTotal: { kind: "fixed window", rate: 150, period: DAY },
});

/** "Stuur dit naar mezelf" on a phone: a link to this topic for the computer. Starts no analysis. */
export const request = mutation({
  args: {
    email: v.string(),
    catalogVersion: v.string(),
    goalSetKey: v.string(),
    analyticsContext: v.optional(analyticsContextValidator),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim();
    const problem = schoolEmailProblem(email);
    if (problem) throw new ConvexError(problem);
    const { topic } = await chosenTopic(ctx, args.catalogVersion, args.goalSetKey);
    const context = validAnalyticsContext(args.analyticsContext);
    for (const [name, key] of [
      ["reminderPerAddress", emailKey(email)],
      ["reminderPerJourney", context?.journeyId],
      ["reminderTotal", undefined],
    ] as const) {
      if (name === "reminderPerJourney" && !key) continue;
      const { ok } = await limiter.limit(ctx, name, key ? { key } : {});
      if (!ok) throw new ConvexError("rate_limited");
    }
    const { userId, created } = await resolveContact(ctx, email);
    const now = Date.now();
    const goalSet = { catalogVersion: args.catalogVersion, key: topic.key };
    await enqueueEmail(ctx, {
      userId,
      kind: "reminder",
      goalSet,
      dedupeKey: `reminder:${userId}:${now}`,
      analyticsContext: context,
    });
    await captureForContact(ctx, context, userId, "reminder_requested", {
      subject_key: topic.key,
      group_key: topic.group.sourceKey,
      had_input: !created,
    });
    if (created) await startWelcome(ctx, userId, "reminder", context);
  },
});
