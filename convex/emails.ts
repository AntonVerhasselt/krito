import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { AnalyticsContext, AnalyticsEvent } from "../shared/analytics";
import { analyticsErrorCode } from "../shared/analytics";
import { captureEmail, captureForContact } from "./analytics";
import { reportInput } from "./reports";
import { verifyUnsubscribeToken } from "../shared/email/signing";
import type { EmailStatus } from "./emailValidators";
import { emailModeAllows } from "../shared/emailPolicy";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Welcome 1 an hour after the address is first entered, 2 two days later, 3 three days after that. */
export const WELCOME_DELAYS = [HOUR, 2 * DAY, 3 * DAY];
/** Transient provider trouble is retried this many times, with these delays. */
const RETRY_DELAYS = [30_000, 2 * MINUTE, 10 * MINUTE, HOUR, 6 * HOUR];
/** A delivery action runs at most 10 minutes; a claim older than this was interrupted. */
const CLAIM_LEASE = 15 * MINUTE;

/** Testing only: shortens the welcome delays. Never applies once e-mail is live. */
export function welcomeDelay(step: number) {
  const scale = Number(process.env.WELCOME_DELAY_SCALE);
  const usable = process.env.EMAIL_MODE !== "live" && scale > 0 && scale <= 1;
  return Math.round(WELCOME_DELAYS[step - 1] * (usable ? scale : 1));
}

/** Resend's daily quota resets at midnight UTC: try again a few minutes after. */
export function afterQuotaReset(now: number) {
  const next = new Date(now);
  next.setUTCHours(24, 5, 0, 0);
  return next.getTime();
}

/**
 * Every contact record of one mailbox. Addresses are stored as typed, so
 * "Juf@School.be" and "juf@school.be" are two users but one inbox.
 */
async function mailbox(ctx: QueryCtx, user: Doc<"users">) {
  return await ctx.db
    .query("users")
    .withIndex("by_email_key", (q) => q.eq("emailKey", user.emailKey))
    .collect();
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

async function scheduleDelivery(ctx: MutationCtx, messageId: Id<"emailMessages">, sendAt: number) {
  const scheduledFunctionId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(sendAt, internal.node.email.deliver, {
    messageId,
  });
  return scheduledFunctionId;
}

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
  await ctx.db.patch(messageId, { scheduledFunctionId: await scheduleDelivery(ctx, messageId, sendAt) });
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
  if (!user || user.welcome) return;
  const inbox = await mailbox(ctx, user);
  if (inbox.some((u) => u.welcome || u.emailUnsubscribedAt || u.emailSuppressedAt)) return;
  const now = Date.now();
  await ctx.db.patch(userId, { welcome: { status: "active", source, startedAt: now }, updatedAt: now });
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

/** Stops the rest of one contact's sequence: unsubscribed, bounced, complained or not deliverable. */
async function stopWelcome(ctx: MutationCtx, userId: Id<"users">, reason: string) {
  const user = await ctx.db.get(userId);
  if (!user?.welcome || user.welcome.status !== "active") return;
  await ctx.db.patch(userId, { welcome: { ...user.welcome, status: "stopped", stoppedReason: reason }, updatedAt: Date.now() });
  const messages = await ctx.db
    .query("emailMessages")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let context: AnalyticsContext | undefined;
  for (const m of messages) {
    if (m.kind !== "welcome") continue;
    context ??= m.analyticsContext;
    if (m.status !== "scheduled") continue;
    if (m.scheduledFunctionId) await ctx.scheduler.cancel(m.scheduledFunctionId);
    await ctx.db.patch(m._id, { status: "cancelled", errorCode: reason, updatedAt: Date.now() });
  }
  await captureForContact(ctx, context, userId, "welcome_sequence_stopped", { reason });
}

/** A permanent bounce, complaint or provider suppression silences the whole mailbox. */
async function suppress(ctx: MutationCtx, userId: Id<"users">, reason: string) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  for (const u of await mailbox(ctx, user)) {
    if (!u.emailSuppressedAt)
      await ctx.db.patch(u._id, { emailSuppressedAt: Date.now(), emailSuppressedReason: reason, updatedAt: Date.now() });
    await stopWelcome(ctx, u._id, reason);
  }
}

async function topicOf(ctx: QueryCtx, goalSet: { catalogVersion: string; key: string }) {
  const set = await ctx.db
    .query("goalSets")
    .withIndex("by_version_key", (q) => q.eq("catalogVersion", goalSet.catalogVersion).eq("key", goalSet.key))
    .unique();
  return set ? { title: set.title, group: set.group.title } : null;
}

/** Everything the delivery action needs, read in one consistent snapshot. */
/**
 * Whether the finished report will land in the teacher's mailbox, so the
 * results page only promises an e-mail that is really sent.
 */
export async function reportWillBeMailed(ctx: QueryCtx, a: Doc<"analyses">) {
  if (!a.userId || a.testMode || a.fixture) return false;
  const user = await ctx.db.get(a.userId);
  if (!user || !emailModeAllows(user.email, process.env)) return false;
  return !(await mailbox(ctx, user)).some((u) => !!u.emailSuppressedAt);
}

export const loadDelivery = internalQuery({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const user = await ctx.db.get(message.userId);
    if (!user) return null;
    const inbox = await mailbox(ctx, user);
    let hasCompletedAnalysis = false;
    let lastReminder: Doc<"emailMessages"> | undefined;
    for (const u of inbox) {
      const analyses = await ctx.db
        .query("analyses")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      hasCompletedAnalysis ||= analyses.some((a) => a.status === "completed" && !a.testMode && !a.fixture);
      const messages = await ctx.db
        .query("emailMessages")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      // Only reminders from before this e-mail was queued: a retry must render the same e-mail.
      for (const m of messages)
        if (
          m.kind === "reminder" &&
          m.goalSet &&
          m.createdAt <= message.createdAt &&
          (!lastReminder || m.createdAt > lastReminder.createdAt)
        )
          lastReminder = m;
    }
    const analysis = message.analysisId ? await ctx.db.get(message.analysisId) : null;
    return {
      message,
      user: {
        email: user.email,
        suppressed: inbox.some((u) => !!u.emailSuppressedAt),
        unsubscribed: inbox.some((u) => !!u.emailUnsubscribedAt),
        welcomeActive: user.welcome?.status === "active",
      },
      hasCompletedAnalysis,
      report: analysis ? await reportInput(ctx, analysis) : null,
      topic: message.goalSet ? await topicOf(ctx, message.goalSet) : null,
      reminder: lastReminder?.goalSet
        ? { goalSet: lastReminder.goalSet, topic: await topicOf(ctx, lastReminder.goalSet) }
        : null,
    };
  },
});

/**
 * Takes the message for sending and returns this attempt's number, or null when
 * another run already owns it. Every later bookkeeping step must present the
 * same number, so a run that outlived its lease cannot overwrite a newer one.
 */
export const claim = internalMutation({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "scheduled") return null;
    const attempt = m.attempts + 1;
    await ctx.db.patch(messageId, { status: "sending", attempts: attempt, claimedAt: Date.now(), updatedAt: Date.now() });
    return attempt;
  },
});

const attemptArgs = { messageId: v.id("emailMessages"), attempt: v.number() };
async function owned(ctx: MutationCtx, messageId: Id<"emailMessages">, attempt: number) {
  const m = await ctx.db.get(messageId);
  return m && m.status === "sending" && m.attempts === attempt ? m : null;
}

/** The welcome variant is fixed before the first send, so a retry sends the same e-mail. */
export const noteTemplate = internalMutation({
  args: { ...attemptArgs, template: v.string() },
  handler: async (ctx, { messageId, attempt, template }) => {
    const m = await owned(ctx, messageId, attempt);
    if (m && !m.template) await ctx.db.patch(messageId, { template, updatedAt: Date.now() });
  },
});

export const markSent = internalMutation({
  args: { ...attemptArgs, providerId: v.string(), template: v.string() },
  handler: async (ctx, { messageId, attempt, providerId, template }) => {
    const m = await owned(ctx, messageId, attempt);
    if (!m) return;
    const now = Date.now();
    await ctx.db.patch(messageId, { status: "sent", providerId, template, sentAt: now, errorCode: undefined, updatedAt: now });
    await captureEmail(ctx, (await ctx.db.get(messageId))!, "email_message_sent");
    // Webhook events that arrived before this send was recorded.
    const waiting = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_applied", (q) => q.eq("providerId", providerId).eq("applied", false))
      .collect();
    for (const e of waiting.sort((a, b) => a.event!.at - b.event!.at)) {
      await applyEvent(ctx, (await ctx.db.get(messageId))!, e.event!);
      await ctx.db.patch(e._id, { applied: true });
    }
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
  args: { ...attemptArgs, reason: v.string() },
  handler: async (ctx, { messageId, attempt, reason }) => {
    const m = await owned(ctx, messageId, attempt);
    if (!m) return;
    await ctx.db.patch(messageId, { status: "skipped", errorCode: reason, updatedAt: Date.now() });
    await captureEmail(ctx, (await ctx.db.get(messageId))!, "email_message_skipped", { reason });
    if (m.kind === "welcome") await stopWelcome(ctx, m.userId, reason);
  },
});

/** Schedules the next attempt, or fails the message once the retries are used up. */
async function retry(ctx: MutationCtx, m: Doc<"emailMessages">, errorCode: string) {
  const now = Date.now();
  const deferrals = m.deferrals ?? 0;
  let sendAt: number;
  if (errorCode === "quota_exceeded" || errorCode === "monthly_quota_exceeded") {
    // Waiting for a full Resend quota (daily: midnight UTC; monthly: a plan
    // upgrade) doesn't use up a retry. Three days after the first wait the
    // e-mail is no longer useful, so give up then. Counted from the first wait,
    // not creation: welcome steps are queued days before they are due.
    const since = m.firstDeferredAt ?? now;
    if (now - since > 3 * DAY) return await fail(ctx, m, errorCode);
    sendAt = afterQuotaReset(now);
    await ctx.db.patch(m._id, { deferrals: deferrals + 1, firstDeferredAt: since });
  } else {
    // `attempts` only grows (it is the ownership token); the budget excludes quota waits.
    const failures = m.attempts - deferrals;
    if (failures > RETRY_DELAYS.length) return await fail(ctx, m, errorCode);
    sendAt = now + RETRY_DELAYS[failures - 1];
  }
  await ctx.db.patch(m._id, {
    status: "scheduled",
    sendAt,
    errorCode,
    scheduledFunctionId: await scheduleDelivery(ctx, m._id, sendAt),
    updatedAt: now,
  });
}

/** Transient provider trouble or a full Resend quota: try again later. */
export const markRetry = internalMutation({
  args: { ...attemptArgs, errorCode: v.string() },
  handler: async (ctx, { messageId, attempt, errorCode }) => {
    const m = await owned(ctx, messageId, attempt);
    if (m) await retry(ctx, m, errorCode);
  },
});

async function fail(ctx: MutationCtx, m: Doc<"emailMessages">, errorCode: string) {
  await ctx.db.patch(m._id, { status: "failed", errorCode, updatedAt: Date.now() });
  await captureEmail(ctx, (await ctx.db.get(m._id))!, "email_message_failed", { error_code: analyticsErrorCode(errorCode) });
  if (m.kind === "welcome") await stopWelcome(ctx, m.userId, errorCode);
}

export const markFailed = internalMutation({
  args: { ...attemptArgs, errorCode: v.string() },
  handler: async (ctx, { messageId, attempt, errorCode }) => {
    const m = await owned(ctx, messageId, attempt);
    if (m) await fail(ctx, m, errorCode);
  },
});

/** Cron: a delivery that died mid-run (timeout, crash) is retried instead of staying "sending". */
export const recoverInterrupted = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("emailMessages")
      .withIndex("by_status_updated", (q) => q.eq("status", "sending").lt("updatedAt", Date.now() - CLAIM_LEASE))
      .take(50);
    for (const m of stale) await retry(ctx, m, "delivery_interrupted");
    // Webhook event ids only need to outlive Resend's retry window (about a day).
    const old = await ctx.db
      .query("webhookEvents")
      .withIndex("by_received", (q) => q.lt("receivedAt", Date.now() - 7 * DAY))
      .take(200);
    for (const e of old) await ctx.db.delete(e._id);
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

type ProviderEvent = { type: string; at: number; bounceType?: string };

/** Applies one delivery, bounce, complaint, open or click event to a message. */
async function applyEvent(ctx: MutationCtx, m: Doc<"emailMessages">, { type, at, bounceType }: ProviderEvent) {
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
}

/**
 * One Resend webhook event, applied once per event id. An event can arrive
 * before markSent stored the provider id (or its send result was lost and a
 * recovery run re-sends later): it is kept and applied when the send is recorded.
 * Events for sample sends or other deployments simply expire with the rest.
 */
export const recordEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    providerId: v.string(),
    at: v.number(),
    bounceType: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, providerId, ...event }): Promise<"recorded" | "duplicate" | "pending"> => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();
    if (seen) return "duplicate";
    const m = await ctx.db
      .query("emailMessages")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .first();
    await ctx.db.insert("webhookEvents", { eventId, receivedAt: Date.now(), providerId, applied: !!m, event });
    if (!m) return "pending";
    await applyEvent(ctx, m, event);
    return "recorded";
  },
});

/** Unsubscribing applies to the mailbox, however its address was capitalised. */
async function unsubscribeUser(ctx: MutationCtx, token: string) {
  const secret = process.env.EMAIL_LINK_SECRET;
  const raw = secret ? await verifyUnsubscribeToken(token, secret) : null;
  const userId = raw ? ctx.db.normalizeId("users", raw) : null;
  const user = userId ? await ctx.db.get(userId) : null;
  if (!user) throw new ConvexError("invalid_link");
  if (user.emailUnsubscribedAt) return;
  const now = Date.now();
  let last: Doc<"emailMessages"> | undefined;
  for (const u of await mailbox(ctx, user)) {
    if (!u.emailUnsubscribedAt) await ctx.db.patch(u._id, { emailUnsubscribedAt: now, updatedAt: now });
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    for (const m of messages) if (m.kind === "welcome" && m.sentAt && (!last || m.sentAt > last.sentAt!)) last = m;
    await stopWelcome(ctx, u._id, "unsubscribed");
  }
  await captureForContact(ctx, last?.analyticsContext, last?.userId ?? user._id, "email_unsubscribed", {
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

/** Consent withdrawn: e-mails caused by this contact stop reporting to PostHog. */
export async function withdrawEmailAnalytics(ctx: MutationCtx, userId: Id<"users">) {
  const messages = await ctx.db
    .query("emailMessages")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const m of messages) if (m.analyticsContext) await ctx.db.patch(m._id, { analyticsContext: undefined });
}

/**
 * Consent withdrawn in a browser without an analysis (the mobile reminder):
 * forget the analytics context of e-mails that browser journey caused. It can
 * only remove telemetry, so the unguessable journey id is enough.
 */
export const withdrawJourneyAnalytics = mutation({
  args: { journeyId: v.string() },
  handler: async (ctx, { journeyId }) => {
    if (/^[A-Za-z0-9_-]{1,100}$/.test(journeyId)) await withdrawJourneyBatch(ctx, journeyId);
  },
});

const WITHDRAW_BATCH = 200;
async function withdrawJourneyBatch(ctx: MutationCtx, journeyId: string) {
  const messages = await ctx.db
    .query("emailMessages")
    .withIndex("by_journey", (q) => q.eq("analyticsContext.journeyId", journeyId))
    .take(WITHDRAW_BATCH);
  for (const m of messages) await ctx.db.patch(m._id, { analyticsContext: undefined });
  // More than one batch: continue in a new transaction until none are left.
  if (messages.length === WITHDRAW_BATCH)
    await ctx.scheduler.runAfter(0, internal.emails.withdrawJourneyRest, { journeyId });
}

export const withdrawJourneyRest = internalMutation({
  args: { journeyId: v.string() },
  handler: async (ctx, { journeyId }) => {
    await withdrawJourneyBatch(ctx, journeyId);
  },
});
