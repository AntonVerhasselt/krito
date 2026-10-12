import { PostHog } from "@posthog/convex";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  safeAnalyticsProperties, sanitizedError,
  type AnalyticsContext, type AnalyticsEvent, type AnalyticsProperties,
} from "../shared/analytics";
import { emailDomain } from "../shared/emailPolicy";

export const analyticsContextValidator = v.object({
  distinctId: v.string(), sessionId: v.string(), journeyId: v.string(),
  anonymous: v.boolean(), consent: v.literal(true),
  environment: v.union(v.literal("local"), v.literal("preview"), v.literal("hosted")),
});

// Browser metadata is never an access credential. Ignore malformed identifiers.
export function validAnalyticsContext(context?: AnalyticsContext): AnalyticsContext | undefined {
  if (!context || ![context.distinctId, context.sessionId, context.journeyId]
    .every((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id))) return undefined;
  return context;
}

const posthog = new PostHog(components.posthog);
function contextEnabled(context?: AnalyticsContext): context is AnalyticsContext {
  return context?.consent === true && !!process.env.POSTHOG_PROJECT_TOKEN &&
    (context.environment !== "local" || process.env.POSTHOG_ENABLE_LOCAL === "true");
}
function enabled(a: Doc<"analyses">) {
  return !a.fixture && !a.testMode && contextEnabled(a.analyticsContext);
}

function properties(a: Doc<"analyses">, extra: AnalyticsProperties = {}) {
  return safeAnalyticsProperties({
    event_schema_version: 1,
    environment: a.analyticsContext?.environment,
    backend_environment: process.env.APP_ENV ?? "unknown",
    is_test: a.analyticsContext?.environment === "local",
    is_demo: false,
    surface: "backend", journey_id: a.analyticsContext?.journeyId,
    originating_session_id: a.analyticsContext?.sessionId,
    analysis_id: a._id, attempt: a.attempt,
    subject_key: a.goalSetKey, catalog_version: a.catalogVersion,
    group_key: a.topic.group.sourceKey, route_code: a.topic.group.routeCode,
    goal_count: a.goalIds.length,
    $process_person_profile: !!a.userId,
    ...extra,
  });
}

// Only schedule delivery. Telemetry is deliberately fail-open and no raw error is logged.
export async function captureAnalysis(
  ctx: MutationCtx, a: Doc<"analyses">, event: AnalyticsEvent,
  extra: AnalyticsProperties = {}, timestamp = Date.now(),
) {
  if (!enabled(a)) return;
  try {
    await posthog.capture(ctx, {
      event, distinctId: a.userId ?? a.analyticsContext!.distinctId,
      properties: properties(a, extra), timestamp: new Date(timestamp), disableGeoip: true,
    });
  } catch { /* Analytics must never roll back application operations. */ }
}

export async function identifyContact(ctx: MutationCtx, a: Doc<"analyses">) {
  if (!enabled(a) || !a.userId) return;
  try {
    const user = await ctx.db.get(a.userId);
    if (!user) return;
    await posthog.identify(ctx, {
      distinctId: user._id,
      properties: {
        $set: { email: user.email, email_domain: emailDomain(user.email),
          email_verified: false, identity_type: "email_contact", last_analysis_at: a.submittedAt },
        $set_once: { first_identified_at: new Date().toISOString() },
        // Never merge one known contact into another on shared browsers.
        ...(a.analyticsContext!.anonymous && a.analyticsContext!.distinctId !== user._id
          ? { $anon_distinct_id: a.analyticsContext!.distinctId } : {}),
      }, disableGeoip: true,
    });
  } catch { /* The application contact persists even when analytics is unavailable. */ }
}

export async function captureAnalysisException(
  ctx: MutationCtx, a: Doc<"analyses">, code: string, operation: string,
  extra: AnalyticsProperties = {},
) {
  if (!enabled(a)) return;
  try {
    await posthog.captureException(ctx, {
      distinctId: a.userId ?? a.analyticsContext!.distinctId,
      error: sanitizedError(code, operation),
      additionalProperties: properties(a, { operation, ...extra }),
    });
  } catch { /* No telemetry failure is allowed to fail an analysis. */ }
}

/**
 * Events without an analysis document (e-mail, reminders): consent travels with
 * the context of the request that caused them. The contact is the distinct id.
 */
export async function captureForContact(
  ctx: MutationCtx, context: AnalyticsContext | undefined, userId: Id<"users">,
  event: AnalyticsEvent, extra: AnalyticsProperties = {},
) {
  if (!contextEnabled(context)) return;
  try {
    await posthog.capture(ctx, {
      event, distinctId: userId, disableGeoip: true,
      properties: safeAnalyticsProperties({
        event_schema_version: 1, environment: context.environment,
        backend_environment: process.env.APP_ENV ?? "unknown",
        is_test: context.environment === "local", is_demo: false, surface: "backend",
        journey_id: context.journeyId, originating_session_id: context.sessionId,
        $process_person_profile: true, ...extra,
      }),
    });
  } catch { /* Analytics must never roll back e-mail bookkeeping. */ }
}

export async function captureEmail(
  ctx: MutationCtx, m: Doc<"emailMessages">, event: AnalyticsEvent, extra: AnalyticsProperties = {},
) {
  await captureForContact(ctx, m.analyticsContext, m.userId, event, {
    analysis_id: m.analysisId, subject_key: m.goalSet?.key, email_kind: m.kind,
    sequence_step: m.step, email_variant: m.template, attempt: m.attempts, ...extra,
  });
}
