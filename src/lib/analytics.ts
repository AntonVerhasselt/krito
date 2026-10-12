"use client";

import posthog, { type CaptureResult } from "posthog-js";
import {
  analyticsErrorCode, routePattern, safeAnalyticsProperties, sanitizedError,
  type AnalyticsContext, type AnalyticsEvent, type AnalyticsProperties,
} from "../../shared/analytics";

export type AnalyticsConsent = "unknown" | "granted" | "denied";
const consentKey = "krito-analytics-consent-v1";
const listeners = new Set<() => void>();
const captured = new Set<string>();
let initialized = false;
let memoryConsent: AnalyticsConsent = "unknown";
let consentOverride: AnalyticsConsent | undefined;
const diagnostics: { event: string; properties: Record<string, unknown> }[] = [];
const enabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === "true";
const environment = process.env.NEXT_PUBLIC_KRITO_ENVIRONMENT === "preview" ? "preview" :
  process.env.NEXT_PUBLIC_KRITO_ENVIRONMENT === "hosted" ? "hosted" : "local";

export function analyticsAvailable() {
  return enabled && !!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
}
export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return "unknown";
  if (consentOverride !== undefined) return consentOverride;
  try {
    const stored = localStorage.getItem(consentKey);
    return stored === "granted" || stored === "denied" ? stored : memoryConsent;
  } catch { return memoryConsent; }
}
export function subscribeAnalyticsConsent(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function sanitizedUrl(value: unknown, referrer = false): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    return referrer ? url.origin : `${url.origin}${routePattern(url.pathname)}`;
  } catch { return undefined; }
}

const sdkKeys = new Set([
  "distinct_id", "$device_id", "$user_id", "$anon_distinct_id", "$session_id", "$window_id",
  "$is_identified", "$process_person_profile", "$os", "$os_version", "$browser", "$browser_version",
  "$device_type", "$lib", "$lib_version", "$host", "$screen_height", "$screen_width",
  "$viewport_height", "$viewport_width", "$referring_domain", "$search_engine",
  "$utm_source", "$utm_medium", "$utm_campaign", "$exception_level", "$exception_source",
]);

function scrubExceptionList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((exception) => {
    const item = exception as Record<string, unknown>;
    const stack = item.stacktrace as { frames?: Record<string, unknown>[] } | undefined;
    const mechanism = item.mechanism as { type?: unknown; handled?: unknown } | undefined;
    return {
      type: typeof item.type === "string" && /^[A-Za-z]{1,40}$/.test(item.type) ? item.type : "Error",
      value: "Unexpected application error",
      mechanism: {
        type: typeof mechanism?.type === "string" && /^[\w-]{1,60}$/.test(mechanism.type) ? mechanism.type : "generic",
        ...(typeof mechanism?.handled === "boolean" ? { handled: mechanism.handled } : {}),
      },
      stacktrace: { frames: (stack?.frames ?? []).slice(0, 40).map((frame) => {
        const safe: Record<string, unknown> = {};
        for (const key of ["lineno", "colno", "in_app"]) {
          if (typeof frame[key] === "number" || typeof frame[key] === "boolean") safe[key] = frame[key];
        }
        if (typeof frame.chunk_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(frame.chunk_id)) safe.chunk_id = frame.chunk_id;
        for (const key of ["filename", "abs_path"]) {
          if (typeof frame[key] === "string") {
            const value = frame[key] as string;
            try {
              const url = new URL(value, window.location.origin);
              if (url.origin === window.location.origin && url.pathname.includes("/_next/static/")) safe[key] = `${url.origin}${url.pathname}`;
            } catch { /* Non-public code paths are omitted. */ }
          }
        }
        if (typeof frame.function === "string" && /^[\w.$<> ]{1,80}$/.test(frame.function)) safe.function = frame.function;
        return safe;
      }) },
    };
  });
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event || getAnalyticsConsent() !== "granted") return null;
  // Session recordings are disabled; reject snapshots even if an SDK sends one.
  if (event.event === "$snapshot") return null;
  const original = event.properties;
  const properties: Record<string, unknown> = {
    ...safeAnalyticsProperties(original),
    environment,
    event_schema_version: 1,
    route_pattern: routePattern(window.location.pathname),
    is_demo: window.location.pathname.startsWith("/results/demo") || original.is_demo === true,
    is_test: environment === "local" || original.is_test === true,
    release: process.env.NEXT_PUBLIC_KRITO_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "development",
  };
  // This is the public ingestion token, not an application access capability.
  // The SDK drops events when before_send removes it.
  properties.token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  for (const key of sdkKeys) {
    const value = original[key];
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) properties[key] = value;
    else if (typeof value === "string" && value.length <= 160 && !/@|https?:|[?&=]|[a-f0-9]{64}/i.test(value)) properties[key] = value;
  }
  properties.$current_url = sanitizedUrl(original.$current_url ?? window.location.href);
  properties.$process_person_profile = original.$is_identified === true || event.event === "$identify";
  properties.$pathname = routePattern(window.location.pathname);
  if (original.$referrer) properties.$referrer = sanitizedUrl(original.$referrer, true);
  if (event.event === "$exception") {
    properties.$exception_list = scrubExceptionList(original.$exception_list);
    properties.$exception_message = "Unexpected application error";
    properties.$exception_type = typeof original.$exception_type === "string" && /^[A-Za-z]{1,40}$/.test(original.$exception_type) ? original.$exception_type : "Error";
    if (typeof original.$release_id === "string" && /^[\w.:-]{1,160}$/.test(original.$release_id)) properties.$release_id = original.$release_id;
  }
  // Numeric vitals are useful; SDK nested performance payloads can contain element text/URLs.
  if (event.event === "$web_vitals") {
    for (const [key, value] of Object.entries(original)) {
      if (/^\$web_vitals_[A-Z]+_value$/.test(key) && typeof value === "number" && Number.isFinite(value)) properties[key] = value;
    }
  }
  event.properties = properties;
  for (const field of ["$set", "$set_once"] as const) {
    if (event[field]) event[field] = {};
  }
  remember(event.event, properties);
  return event;
}

function remember(event: string, properties: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_POSTHOG_DEBUG !== "true") return;
  const safe = { ...properties };
  delete safe.token;
  diagnostics.push({ event, properties: safe });
  if (diagnostics.length > 500) diagnostics.shift();
}

export function initializeAnalytics() {
  if (typeof window === "undefined" || !analyticsAvailable() || getAnalyticsConsent() !== "granted") return;
  try {
    const fresh = !initialized;
    if (!initialized) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        ui_host: "https://eu.posthog.com",
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: "history_change",
        capture_pageleave: true,
        capture_dead_clicks: false,
        rageclick: false,
        capture_heatmaps: false,
        capture_performance: { web_vitals: true, network_timing: false },
        capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
        disable_surveys: true,
        disable_session_recording: true,
        enable_recording_console_log: false,
        ip: false,
        before_send: beforeSend,
      });
      initialized = true;
    }
    // A stored SDK opt-out survives reload even though our own choice was just granted.
    if (posthog.has_opted_out_capturing()) {
      posthog.opt_in_capturing({ captureEventName: false });
      // Fresh initialization already schedules one initial pageview on the next tick.
      if (!fresh) posthog.capture("$pageview");
    }
    if (process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true") {
      Object.assign(window, { __kritoAnalytics: {
        events: diagnostics,
        status: () => ({ consent: getAnalyticsConsent(), initialized, recording: posthog.sessionRecordingStarted(), distinctId: posthog.get_distinct_id() }),
      } });
    }
  } catch { /* Telemetry never blocks the product. */ }
}

export function setAnalyticsConsent(consent: "granted" | "denied") {
  memoryConsent = consent;
  // A readable old choice must not override a new choice when storage rejects writes.
  consentOverride = consent;
  try {
    localStorage.setItem(consentKey, consent);
    consentOverride = undefined;
  } catch { /* The explicit choice remains authoritative for this visit. */ }
  // The server needs the same explicit opt-in before reporting request errors.
  try {
    document.cookie = `krito_analytics_consent=${consent}; Path=/; SameSite=Lax; Max-Age=15552000${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* Browser privacy settings must not prevent choosing. */ }
  if (consent === "granted") {
    initializeAnalytics();
    track("analytics_consent_granted", { consent_version: 1 });
  } else if (initialized) {
    try { posthog.opt_out_capturing(); } catch { /* fail closed */ }
    captured.clear();
    diagnostics.length = 0;
  }
  listeners.forEach((listener) => listener());
}

export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  if (!initialized || getAnalyticsConsent() !== "granted") return;
  try { posthog.capture(event, safeAnalyticsProperties({ journey_id: analyticsContext()?.journeyId, ...properties })); } catch { /* fail open */ }
}
export function trackOnce(key: string, event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  if (!initialized || getAnalyticsConsent() !== "granted" || captured.has(key)) return;
  captured.add(key);
  track(event, properties);
}
export function analyticsContext(): AnalyticsContext | undefined {
  if (!initialized || getAnalyticsConsent() !== "granted") return undefined;
  try {
    let journeyId = sessionStorage.getItem("krito-analytics-journey");
    if (!journeyId) { journeyId = crypto.randomUUID(); sessionStorage.setItem("krito-analytics-journey", journeyId); }
    return { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id(), journeyId,
      anonymous: !posthog.get_property("$user_id"), consent: true, environment };
  } catch { return undefined; }
}
export function identifyContact(distinctId: string) {
  if (!initialized || getAnalyticsConsent() !== "granted" || !/^[a-z0-9]{10,80}$/.test(distinctId)) return;
  try {
    const current = posthog.get_property("$user_id");
    if (current && current !== distinctId) { posthog.reset(); posthog.opt_in_capturing({ captureEventName: false }); }
    if (posthog.get_distinct_id() !== distinctId) posthog.identify(distinctId);
  } catch { /* Identification never blocks navigation. */ }
}
export function captureAnalyticsError(error: unknown, operation: string, properties: AnalyticsProperties = {}) {
  if (!initialized || getAnalyticsConsent() !== "granted") return;
  const code = analyticsErrorCode(error);
  const validation = ["personal_email", "invalid_email", "invalid_capability", "unavailable", "invalid_topic",
    "unsupported_type", "file_too_large", "total_too_large", "encrypted_pdf", "invalid_pdf", "files_not_ready"];
  if (validation.includes(code)) return;
  try { posthog.captureException(sanitizedError(error, operation), safeAnalyticsProperties({ ...properties, operation, error_code: code })); }
  catch { /* fail open */ }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === consentKey || event.key === null) {
      // Another tab changed or cleared consent. Re-read its persisted decision.
      memoryConsent = "unknown";
      consentOverride = undefined;
      if (getAnalyticsConsent() === "granted") initializeAnalytics();
      else if (initialized) {
        try { posthog.opt_out_capturing(); } catch { /* fail closed */ }
      }
      listeners.forEach((listener) => listener());
    }
  });
}
