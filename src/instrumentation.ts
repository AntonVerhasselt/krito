import type { Instrumentation } from "next";
import { routePattern, safeAnalyticsProperties, sanitizedError } from "../shared/analytics";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "true" ||
    !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  const header = request.headers.cookie;
  const cookies = Object.fromEntries((Array.isArray(header) ? header.join("; ") : header ?? "")
    .split(";").map((part) => { const i = part.indexOf("="); return [part.slice(0, i).trim(), part.slice(i + 1)]; }));
  if (cookies.krito_analytics_consent !== "granted") return;
  try {
    const { PostHog } = await import("posthog-node");
    const client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST, flushAt: 1, flushInterval: 0,
      disableGeoip: true, requestTimeout: 2000, fetchRetryCount: 0,
    });
    let distinctId: string = crypto.randomUUID();
    try {
      const saved = JSON.parse(decodeURIComponent(cookies[`ph_${process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN}_posthog`] ?? ""));
      if (typeof saved.distinct_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(saved.distinct_id)) distinctId = saved.distinct_id;
    } catch { /* Request errors can have no existing browser identity. */ }
    client.captureException(sanitizedError(error, "server_request"), distinctId, safeAnalyticsProperties({
      operation: "server_request", route_pattern: routePattern(context.routePath),
      environment: process.env.NEXT_PUBLIC_KRITO_ENVIRONMENT ?? "local",
      release: process.env.NEXT_PUBLIC_KRITO_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "development",
      $process_person_profile: false,
    }));
    await client.shutdown();
  } catch { /* Reporting must never interfere with the original failure. */ }
};
