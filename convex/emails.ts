import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { AnalyticsContext, AnalyticsEvent } from "../shared/analytics";
import { analyticsErrorCode } from "../shared/analytics";
import { captureEmail, captureForContact } from "./analytics";
import { emailKey } from "./users";
import { reportInput } from "./reports";
import { verifyUnsubscribeToken } from "../shared/email/signing";
import type { EmailStatus } from "./emailValidators";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Welcome 1 an hour after the address is first entered, 2 two days later, 3 three days after that. */
export const WELCOME_DELAYS = [HOUR, 2 * DAY, 3 * DAY];

/** Testing only: shortens the welcome delays. Never applies once e-mail is live. */
export function welcomeDelay(step: number) {
  const scale = Number(process.env.WELCOME_DELAY_SCALE);
  const usable = process.env.EMAIL_MODE !== "live" && scale > 0 && scale <= 1;
  return Math.round(WELCOME_DELAYS[step - 1] * (usable ? scale : 1));
}

type Enqueue = {
  userId: Id<"users">;
  kind: Doc<"emailMessages">["kind"];
  dedupeKey: string;
  sendAt?: number;
  step?: number;
  analysisId?: Id<"analyses">;
  goalSet?: { catalogVersion: string; key: string };
  analyticsContext?: AnalyticsContext;
};

/** Records an e-mail and schedules its delivery. A second call with the same dedupeKey does nothing. */
export async function enqueueEmail(ctx: MutationCtx, e: Enqueue): Promise<Id<"emailMessages">> {
  const existing = await ctx.db
    .query("emailMessages")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", e.dedupeKey))
    .first();
  if (existing) return existing._id;
  const now = Date.now();
  const sendAt = Math.max(now, e.sendAt ?? now);
  const messageId = await ctx.db.insert("emailMessages", {
    userId: e.userId,
    kind: e.kind,
    step: e.step,
    analysisId: e.analysisId,
    goalSet: e.goalSet,
    dedupeKey: e.dedupeKey,
    status: "scheduled",
    sendAt,
    attempts: 0,
    analyticsContext: e.analyticsContext,
    createdAt: now,
    updatedAt: now,
  });
  const scheduledFunctionId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(sendAt, internal.node.email.deliver, {
    messageId,
  });
  await ctx.db.patch(messageId, { scheduledFunctionId });
  await captureEmail(ctx, (await ctx.db.get(messageId))!, "email_message_queued");
  return messageId;
}

/** Starts the welcome sequence for a new contact, once per mailbox. */
export async function startWelcome(
  ctx: MutationCtx,
  userId: Id<"users">,
  source: "analysis" | "reminder",
  analyticsContext?: AnalyticsContext,
) {
  const user = await ctx.db.get(userId);
  if (!user || user.welcome || user.emailSuppressedAt || user.emailUnsubscribedAt) return;
  const key = emailKey(user.email);
  const sameMailbox = await ctx.db
    .query("users")
    .withIndex("by_email_key", (q) => q.eq("emailKey", key))
    .collect();
  if (sameMailbox.some((u) => u._id !== userId && (u.welcome || u.emailUnsubscribedAt || u.emailSuppressedAt))) return;
  const now = Date.now();
  await ctx.db.patch(userId, { emailKey: key, welcome: { status: "active", source, startedAt: now }, updatedAt: now });
  await enqueueEmail(ctx, {
    userId,
    kind: "welcome",
    step: 1,
    dedupeKey: `welcome:${userId}:1`,
    sendAt: now + welcomeDelay(1),
    analyticsContext,
  });
  await captureForContact(ctx, analyticsContext, userId, "welcome_sequence_started", { source });
}

/** Stops the rest of the sequence: unsubscribed, bounced, complained or not deliverable. */
async function stopWelcome(ctx: MutationCtx, userId: Id<"users">, reason: string) {
  const user = await ctx.db.get(userId);
  if (!user?.welcome || user.welcome.status !== "active") return;
  await ctx.db.patch(userId, { welcome: { ...user.welcome, status: "stopped", stoppedReason: reason }, updatedAt: Date.now() });
  const pending = await ctx.db
    .query("emailMessages")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let context: AnalyticsContext | undefined;
  for (const m of pending) {
    if (m.kind !== "welcome") continue;
    context ??= m.analyticsContext;
    if (m.status !== "scheduled") continue;
    if (m.scheduledFunctionId) await ctx.scheduler.cancel(m.scheduledFunctionId);
    await ctx.db.patch(m._id, { status: "cancelled", errorCode: reason, updatedAt: Date.now() });
  }
  await captureForContact(ctx, context, userId, "welcome_sequence_stopped", { reason });
}

async function suppress(ctx: MutationCtx, userId: Id<"users">, reason: string) {
  const user = await ctx.db.get(userId);
  if (user && !user.emailSuppressedAt)
    await ctx.db.patch(userId, { emailSuppressedAt: Date.now(), emailSuppressedReason: reason, updatedAt: Date.now() });
  await stopWelcome(ctx, userId, reason);
}

async function topicOf(ctx: QueryCtx, goalSet: { catalogVersion: string; key: string }) {
  const set = await ctx.db
    .query("goalSets")
    .withIndex("by_version_key", (q) => q.eq("catalogVersion", goalSet.catalogVersion).eq("key", goalSet.key))
    .unique();
  return set ? { title: set.title, group: set.group.title } : null;
}

/** Everything the delivery action needs, read in one consistent snapshot. */
export const loadDelivery = internalQuery({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const user = await ctx.db.get(message.userId);
    if (!user) return null;
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const reminders = (
      await ctx.db
        .query("emailMessages")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((m) => m.kind === "reminder" && m.goalSet);
    const lastReminder = reminders.at(-1);
    const analysis = message.analysisId ? await ctx.db.get(message.analysisId) : null;
    return {
      message,
      user: {
        email: user.email,
        suppressed: !!user.emailSuppressedAt,
        unsubscribed: !!user.emailUnsubscribedAt,
        welcomeActive: user.welcome?.status === "active",
      },
      hasCompletedAnalysis: analyses.some((a) => a.status === "completed"),
      report: analysis ? await reportInput(ctx, analysis) : null,
      topic: message.goalSet ? await topicOf(ctx, message.goalSet) : null,
      reminder: lastReminder?.goalSet
        ? { goalSet: lastReminder.goalSet, topic: await topicOf(ctx, lastReminder.goalSet) }
        : null,
    };
  },
});

/** Takes the message for sending; a duplicate run (retry, race) gets false and stops. */
export const claim = internalMutation({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "scheduled") return false;
    await ctx.db.patch(messageId, { status: "sending", attempts: m.attempts + 1, updatedAt: Date.now() });
    return true;
  },
});

export const markSent = internalMutation({
  args: { messageId: v.id("emailMessages"), providerId: v.string(), template: v.string() },
  handler: async (ctx, { messageId, providerId, template }) => {
    const m = await ctx.db.get(messageId);
    if (!m) return;
    const now = Date.now();
    await ctx.db.patch(messageId, { status: "sent", providerId, template, sentAt: now, errorCode: undefined, updatedAt: now });
    await captureEmail(ctx, (await ctx.db.get(messageId))!, "email_message_sent");
    if (m.kind !== "welcome" || !m.step) return;
    const user = await ctx.db.get(m.userId);
    if (user?.welcome?.status !== "active") return;
    if (m.step < WELCOME_DELAYS.length) {
      await enqueueEmail(ctx, {
        userId: m.userId,
        kind: "welcome",
        step: m.step + 1,
        dedupeKey: `welcome:${m.userId}:${m.step + 1}`,
        sendAt: now + welcomeDelay(m.step + 1),
        analyticsContext: m.analyticsContext,
      });
    } else {
      await ctx.db.patch(m.userId, { welcome: { ...user.welcome, status: "completed" }, updatedAt: now });
      await captureForContact(ctx, m.analyticsContext, m.userId, "welcome_sequence_completed", {
        source: user.welcome.source,
      });
    }
  },
});

/** Not sent on purpose (e-mail off, not on the allowlist, unsubscribed, suppressed). */
export const markSkipped = internalMutation({
  args: { messageId: v.id("emailMessages"), reason: v.string() },
  handler: async (ctx, { messageId, reason }) => {
    const m = await ctx.db.get(messageId);
    if (!m) return;
    await ctx.db.patch(messageId, { status: "skipped", errorCode: reason, updatedAt: Date.now() });
    await captureEmail(ctx, (await ctx.db.get(messageId))!, "email_message_skipped", { reason });
    if (m.kind === "welcome") await stopWelcome(ctx, m.userId, reason);
  },
});

const RETRY_DELAYS = [30_000, 2 * 60_000, 10 * 60_000, HOUR, 6 * HOUR];

/** Transient provider trouble: try again later, up to five times. */
export const markRetry = internalMutation({
  args: { messageId: v.id("emailMessages"), errorCode: v.string() },
  handler: async (ctx, { messageId, errorCode }) => {
    const m = await ctx.db.get(messageId);
    if (!m) return;
    if (m.attempts > RETRY_DELAYS.length) {
      await fail(ctx, m, errorCode);
      return;
    }
    // A full daily quota only frees up hours later.
    const delay = errorCode === "quota_exceeded" ? Math.max(HOUR, RETRY_DELAYS[m.attempts - 1]) : RETRY_DELAYS[m.attempts - 1];
    const sendAt = Date.now() + delay;
    const scheduledFunctionId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      sendAt,
      internal.node.email.deliver,
      { messageId },
    );
    await ctx.db.patch(messageId, { status: "scheduled", sendAt, scheduledFunctionId, errorCode, updatedAt: Date.now() });
  },
});

async function fail(ctx: MutationCtx, m: Doc<"emailMessages">, errorCode: string) {
  await ctx.db.patch(m._id, { status: "failed", errorCode, updatedAt: Date.now() });
  await captureEmail(ctx, (await ctx.db.get(m._id))!, "email_message_failed", { error_code: analyticsErrorCode(errorCode) });
  if (m.kind === "welcome") await stopWelcome(ctx, m.userId, errorCode);
}

export const markFailed = internalMutation({
  args: { messageId: v.id("emailMessages"), errorCode: v.string() },
  handler: async (ctx, { messageId, errorCode }) => {
    const m = await ctx.db.get(messageId);
    if (m) await fail(ctx, m, errorCode);
  },
});

const rank: Record<EmailStatus, number> = {
  scheduled: 0,
  sending: 1,
  cancelled: 1,
  skipped: 1,
  sent: 2,
  delivery_delayed: 3,
  delivered: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
};
const statusEvents: Record<string, { status: EmailStatus; event: AnalyticsEvent }> = {
  "email.sent": { status: "sent", event: "email_message_sent" },
  "email.delivery_delayed": { status: "delivery_delayed", event: "email_message_delivery_delayed" },
  "email.delivered": { status: "delivered", event: "email_message_delivered" },
  "email.bounced": { status: "bounced", event: "email_message_bounced" },
  "email.complained": { status: "complained", event: "email_message_complained" },
  "email.failed": { status: "failed", event: "email_message_failed" },
  "email.suppressed": { status: "failed", event: "email_message_failed" },
};
/** Clicks this soon after delivery are most likely a school's link scanner. */
const BOT_CLICK_MS = 10_000;

/** One Resend webhook event. Unknown messages (other deployments, tests) are ignored. */
export const recordEvent = internalMutation({
  args: { type: v.string(), providerId: v.string(), at: v.number(), bounceType: v.optional(v.string()) },
  handler: async (ctx, { type, providerId, at, bounceType }) => {
    const m = await ctx.db
      .query("emailMessages")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .first();
    if (!m) return;
    const now = Date.now();
    const since = at - (m.deliveredAt ?? m.sentAt ?? at);
    if (type === "email.opened" || type === "email.clicked") {
      const opened = type === "email.opened";
      const first = opened ? !m.openedAt : !m.clickedAt;
      await ctx.db.patch(
        m._id,
        opened
          ? { openedAt: m.openedAt ?? at, openCount: (m.openCount ?? 0) + 1, updatedAt: now }
          : { clickedAt: m.clickedAt ?? at, clickCount: (m.clickCount ?? 0) + 1, updatedAt: now },
      );
      if (first)
        await captureEmail(ctx, m, opened ? "email_message_opened" : "email_message_clicked", {
          duration_ms: Math.max(0, since),
          ...(opened ? {} : { is_bot_suspected: since < BOT_CLICK_MS }),
        });
      return;
    }
    const mapped = statusEvents[type];
    if (!mapped) return;
    if (rank[mapped.status] > rank[m.status] || (mapped.status !== m.status && rank[mapped.status] === 5)) {
      await ctx.db.patch(m._id, {
        status: mapped.status,
        ...(mapped.status === "delivered" ? { deliveredAt: at } : {}),
        ...(type === "email.suppressed" ? { errorCode: "email_suppressed" } : {}),
        updatedAt: now,
      });
      if (mapped.status !== "sent")
        await captureEmail(ctx, m, mapped.event, {
          ...(type === "email.bounced" ? { reason: bounceType === "Transient" ? "transient" : "permanent" } : {}),
          ...(type === "email.suppressed" ? { error_code: "email_suppressed" } : {}),
        });
    }
    if (type === "email.bounced" && bounceType !== "Transient") await suppress(ctx, m.userId, "bounced");
    if (type === "email.complained") await suppress(ctx, m.userId, "complained");
    if (type === "email.suppressed") await suppress(ctx, m.userId, "email_suppressed");
  },
});

async function unsubscribeUser(ctx: MutationCtx, token: string) {
  const secret = process.env.EMAIL_LINK_SECRET;
  const raw = secret ? await verifyUnsubscribeToken(token, secret) : null;
  const userId = raw ? ctx.db.normalizeId("users", raw) : null;
  const user = userId ? await ctx.db.get(userId) : null;
  if (!user) throw new ConvexError("invalid_link");
  if (user.emailUnsubscribedAt) return;
  await ctx.db.patch(user._id, { emailUnsubscribedAt: Date.now(), updatedAt: Date.now() });
  const last = (
    await ctx.db
      .query("emailMessages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()
  )
    .filter((m) => m.kind === "welcome" && m.sentAt)
    .at(-1);
  await stopWelcome(ctx, user._id, "unsubscribed");
  await captureForContact(ctx, last?.analyticsContext, user._id, "email_unsubscribed", {
    email_kind: "welcome",
    sequence_step: last?.step,
  });
}

/** The "Schrijf me uit" button on /uitschrijven. */
export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await unsubscribeUser(ctx, token.slice(0, 200));
  },
});

/** Mail clients' one-click unsubscribe (List-Unsubscribe-Post), via http.ts. */
export const unsubscribeOneClick = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    try {
      await unsubscribeUser(ctx, token.slice(0, 200));
      return true;
    } catch {
      return false;
    }
  },
});
