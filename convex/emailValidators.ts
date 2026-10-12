import { v, type Infer } from "convex/values";
import { analyticsContextValidator } from "./analytics";

export const emailKind = v.union(v.literal("report"), v.literal("reminder"), v.literal("welcome"));
/** Delivery moves forward only; opens and clicks are tracked separately. */
export const emailStatus = v.union(
  v.literal("scheduled"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("delivery_delayed"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("skipped"),
);
export type EmailStatus = Infer<typeof emailStatus>;

export const emailMessageFields = {
  userId: v.id("users"),
  kind: emailKind,
  /** Welcome step 1..3. */
  step: v.optional(v.number()),
  /** The md file that was sent, e.g. "welcome-1-analysis"; set at send time. */
  template: v.optional(v.string()),
  analysisId: v.optional(v.id("analyses")),
  goalSet: v.optional(v.object({ catalogVersion: v.string(), key: v.string() })),
  dedupeKey: v.string(),
  status: emailStatus,
  sendAt: v.number(),
  scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
  providerId: v.optional(v.string()),
  attempts: v.number(),
  /** When the current attempt was claimed; a stale claim is recovered by a cron. */
  claimedAt: v.optional(v.number()),
  /** Attempts that only waited for a full Resend quota; they don't use up the retry budget. */
  deferrals: v.optional(v.number()),
  /** When the first quota wait began; the three-day grace counts from here. */
  firstDeferredAt: v.optional(v.number()),
  errorCode: v.optional(v.string()),
  openedAt: v.optional(v.number()),
  openCount: v.optional(v.number()),
  clickedAt: v.optional(v.number()),
  clickCount: v.optional(v.number()),
  /** Copied from the request that caused this e-mail; gates PostHog events. */
  analyticsContext: v.optional(analyticsContextValidator),
  createdAt: v.number(),
  sentAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  updatedAt: v.number(),
};
