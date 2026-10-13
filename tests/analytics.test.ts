import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routePattern, safeAnalyticsProperties, sanitizedError } from "../shared/analytics";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), captureException: vi.fn(),
  startSessionRecording: vi.fn(), stopSessionRecording: vi.fn(), opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(), reset: vi.fn(), identify: vi.fn(),
  get_distinct_id: vi.fn(() => "anonymous-test"), get_session_id: vi.fn(() => "session-test"),
  get_property: vi.fn((): string | undefined => undefined), sessionRecordingStarted: vi.fn(() => true),
  has_opted_out_capturing: vi.fn(() => false),
}));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("window", { location: { origin: "https://krito.example", pathname: "/", href: "https://krito.example/?token=secret" }, addEventListener: vi.fn() });
  vi.stubGlobal("location", { protocol: "https:" });
  vi.stubGlobal("document", { cookie: "" });
  sdk.get_property.mockReturnValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("analytics boundaries", () => {
  it("drops content, email, signed URLs and capabilities even under known property names", () => {
    expect(safeAnalyticsProperties({ filename: "private.pdf", email: "teacher@school.be", accessToken: "a".repeat(64),
      source: "https://bucket.example/file?X-Amz-Signature=secret", subject_key: "a".repeat(64), file_count: 2,
      duration_ms: Infinity, query_length: 8 })).toEqual({ file_count: 2, query_length: 8 });
  });
  it("normalizes private route identifiers and strips sensitive error messages", () => {
    expect(routePattern("/results/private-id")).toBe("/results/[analysisId]");
    const input = new Error("teacher@school.be private quotation");
    input.stack = "Error: private quotation\n    at upload (https://bucket.example/file?token=private:1:2)\n    at click (https://krito.example/_next/static/chunk.js?secret=private:3:4)";
    const error = sanitizedError(input, "upload");
    expect(error.message).toBe("upload: unexpected_error");
    expect(error.stack).not.toContain("teacher@");
    expect(error.stack).not.toContain("private");
    expect(error.stack).toContain("/_next/static/chunk.js");
  });
  it("preserves Firefox/Safari frames including a stack with no message line", () => {
    const error = new Error("private quotation");
    error.stack = "click@https://krito.example/_next/static/chunk.js:12:4\n@https://krito.example/_next/static/chunk.js:20:8";
    const clean = sanitizedError(error, "upload");
    expect(clean.stack).toContain("click@https://krito.example/_next/static/chunk.js:12:4");
    expect(clean.stack).toContain("@https://krito.example/_next/static/chunk.js:20:8");
    expect(clean.stack).not.toContain("private quotation");
  });
  it("makes no SDK calls without opt-in and does not consume once keys", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.initializeAnalytics(); analytics.trackOnce("search", "search_opened");
    expect(sdk.init).not.toHaveBeenCalled(); expect(sdk.capture).not.toHaveBeenCalled();
    analytics.setAnalyticsConsent("granted"); analytics.trackOnce("search", "search_opened");
    analytics.trackOnce("search", "search_opened");
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.capture.mock.calls.filter(([event]) => event === "search_opened")).toHaveLength(1);
  });
  it("suppresses context/events after withdrawal", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted");
    expect(analytics.analyticsContext()).toMatchObject({ consent: true, anonymous: true });
    analytics.setAnalyticsConsent("denied"); const calls = sdk.capture.mock.calls.length;
    analytics.track("search_clicked"); analytics.captureAnalyticsError(new Error("secret"), "upload");
    expect(analytics.analyticsContext()).toBeUndefined(); expect(sdk.capture).toHaveBeenCalledTimes(calls);
    expect(sdk.stopSessionRecording).toHaveBeenCalled();
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    expect(sdk.startSessionRecording).not.toHaveBeenCalled();
  });
  it("overrides persisted SDK opt-out when consent is granted after a reload", async () => {
    const first = await import("../src/lib/analytics");
    first.setAnalyticsConsent("granted"); first.setAnalyticsConsent("denied");
    vi.resetModules(); vi.clearAllMocks();
    sdk.has_opted_out_capturing.mockReturnValueOnce(true);
    const reloaded = await import("../src/lib/analytics");
    reloaded.initializeAnalytics(); expect(sdk.init).not.toHaveBeenCalled();
    reloaded.setAnalyticsConsent("granted");
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    // Resume replay without overriding the project's sampling or triggers.
    expect(sdk.startSessionRecording).toHaveBeenCalledWith();
    expect(sdk.capture.mock.calls.filter(([event]) => event === "$pageview")).toHaveLength(0);
  });
  it("keeps the application usable when capture throws", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted");
    sdk.capture.mockImplementationOnce(() => { throw new Error("Network failure"); });
    expect(() => analytics.track("upload_started", { bytes: 123 })).not.toThrow();
  });
  it.each(["granted", "denied"] as const)("accepts %s even when browser storage and cookies are blocked", async (choice) => {
    const blocked = () => { throw new Error("Storage blocked"); };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    vi.stubGlobal("document", Object.defineProperty({}, "cookie", { set: blocked }));
    const analytics = await import("../src/lib/analytics");
    const listener = vi.fn();
    analytics.subscribeAnalyticsConsent(listener);
    expect(() => analytics.setAnalyticsConsent(choice)).not.toThrow();
    expect(analytics.getAnalyticsConsent()).toBe(choice);
    expect(listener).toHaveBeenCalledOnce();
  });
  it.each([
    ["granted", "denied"],
    ["denied", "granted"],
  ] as const)("honors a change from %s to %s when storage is readable but rejects writes", async (stored, choice) => {
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: () => { throw new Error("Storage write blocked"); },
    });
    const analytics = await import("../src/lib/analytics");
    analytics.initializeAnalytics();
    const listener = vi.fn();
    analytics.subscribeAnalyticsConsent(listener);
    analytics.setAnalyticsConsent(choice);
    expect(analytics.getAnalyticsConsent()).toBe(choice);
    expect(listener).toHaveBeenCalledOnce();
    if (choice === "denied") {
      expect(analytics.analyticsContext()).toBeUndefined();
      expect(sdk.opt_out_capturing).toHaveBeenCalledOnce();
      const captureCount = sdk.capture.mock.calls.length;
      analytics.track("search_clicked");
      expect(sdk.capture).toHaveBeenCalledTimes(captureCount);
      expect(sdk.init.mock.calls[0][1].before_send({ event: "$pageview", properties: {} })).toBeNull();
    } else {
      expect(sdk.init).toHaveBeenCalledOnce();
      expect(analytics.analyticsContext()).toMatchObject({ consent: true });
    }
  });
  it("reconciles a failed-write override when another tab changes or clears consent", async () => {
    let stored: string | null = "granted";
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: () => { throw new Error("Storage write blocked"); },
    });
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("denied");
    expect(analytics.getAnalyticsConsent()).toBe("denied");
    const onStorage = vi.mocked(window.addEventListener).mock.calls
      .find(([event]) => event === "storage")![1] as (event: Partial<StorageEvent>) => void;
    stored = null;
    onStorage({ key: "krito-analytics-consent-v1", newValue: null });
    expect(analytics.getAnalyticsConsent()).toBe("unknown");
    expect(analytics.analyticsContext()).toBeUndefined();
    stored = "granted";
    onStorage({ key: "krito-analytics-consent-v1", newValue: stored });
    expect(analytics.getAnalyticsConsent()).toBe("granted");
    expect(analytics.analyticsContext()).toMatchObject({ consent: true });
    stored = null;
    onStorage({ key: null });
    expect(analytics.getAnalyticsConsent()).toBe("unknown");
    expect(analytics.analyticsContext()).toBeUndefined();
  });
  it("resets before switching known contacts and identifies only valid opaque IDs", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted"); sdk.get_property.mockReturnValue("firstcontact123");
    analytics.identifyContact("secondcontact456");
    expect(sdk.reset).toHaveBeenCalledTimes(1); expect(sdk.identify).toHaveBeenCalledWith("secondcontact456");
    analytics.identifyContact("teacher@school.be"); expect(sdk.identify).toHaveBeenCalledTimes(1);
  });
  it("records a masked replay: private blocks, inputs, URLs and tokens never leave the browser", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted");
    const config = sdk.init.mock.calls[0][1];
    expect(config).toMatchObject({ autocapture: false, enable_recording_console_log: false,
      capture_performance: { network_timing: false } });
    expect(config.disable_session_recording).toBeUndefined();
    expect(config.loaded).toBeUndefined();
    const replay = config.session_recording;
    expect(replay).toMatchObject({ maskAllInputs: true, recordHeaders: false, recordBody: false, captureJsonLd: false });
    expect(replay.blockSelector).toContain("[data-private]");
    expect(replay.blockSelector).toContain('input[type="file"]');
    const mask = replay.maskAttributeFn as (name: string, value: string, element?: { tagName: string }) => string;
    // Krito's own CSS and markup stay, so recordings look like the site.
    expect(mask("_cssText", ".hero{color:red}")).toBe(".hero{color:red}");
    expect(mask("class", "hero-title")).toBe("hero-title");
    expect(mask("href", "/_next/static/chunks/app.css")).toBe("/_next/static/chunks/app.css");
    expect(mask("href", "#prijs")).toBe("#prijs");
    expect(mask("href", "/icon.svg?b0c3a1")).toBe("/icon.svg?b0c3a1");
    expect(mask("href", "/other-page/secret")).toBe("https://krito.example/other");
    expect(mask("srcset", "/_next/image?url=a.webp&w=256 1x, /_next/image?url=a.webp&w=384 2x")).toContain("/_next/image");
    // Private IDs, tokens, signed and local URLs, and form values do not.
    expect(mask("href", "/results/private-id?t=secret")).toBe("https://krito.example/results/[analysisId]");
    expect(mask("href", "/uitschrijven?t=secret")).toBe("https://krito.example/uitschrijven");
    expect(mask("src", "https://bucket.example/file.pdf?X-Amz-Signature=secret")).toBe("[redacted]");
    expect(mask("src", "blob:https://krito.example/1234")).toBe("[redacted]");
    expect(mask("value", "teacher@school.be", { tagName: "INPUT" })).toBe("*".repeat(17));
    const snapshot = config.before_send({ event: "$snapshot", properties: { $snapshot_data: [
      { type: 4, data: { href: "https://krito.example/uitschrijven?t=secret", width: 390, height: 844 } },
      { type: 5, data: { tag: "$pageview", payload: { href: "https://krito.example/results/private-id?t=secret" } } },
      { type: 3, data: { source: 2 } },
    ] } });
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("private-id");
    expect(snapshot.properties.$snapshot_data[0].data).toMatchObject({ href: "https://krito.example/uitschrijven", width: 390 });
    expect(snapshot.properties.$snapshot_data[1].data.payload.href).toBe("https://krito.example/results/[analysisId]");
    const event = config.before_send({ event: "$exception", properties: { distinct_id: "anonymous-test",
      $current_url: "https://krito.example/results/secret-id?token=secret", $exception_message: "private quotation",
      $release_id: "krito:abc123",
      $exception_list: [{ type: "Error", value: "teacher@school.be", mechanism: { type: "onerror", handled: false },
        stacktrace: { frames: [{ filename: "https://bucket.example?token=secret", chunk_id: "0197e6db-9a73-7b91-9e80-4e1b7158db5c" }] } }] } });
    const serialized = JSON.stringify(event);
    expect(event.properties.token).toBe("phc_test");
    expect(event.properties.$process_person_profile).toBe(false);
    expect(event.properties.$release_id).toBe("krito:abc123");
    expect(event.properties.$exception_list[0].stacktrace.frames[0].chunk_id).toBe("0197e6db-9a73-7b91-9e80-4e1b7158db5c");
    expect(event.properties.$exception_list[0].mechanism).toMatchObject({ type: "onerror", handled: false });
    expect(serialized).not.toContain("quotation"); expect(serialized).not.toContain("teacher@"); expect(serialized).not.toContain("token=");
    expect(serialized).toContain("/results/[analysisId]");
    analytics.setAnalyticsConsent("denied"); expect(config.before_send(event)).toBeNull();
    expect(config.before_send({ event: "$snapshot", properties: { $snapshot_data: [] } })).toBeNull();
  });
  it("keeps scroll depth for web analytics without the previous page's private route", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted");
    const config = sdk.init.mock.calls[0][1];
    const event = config.before_send({ event: "$pageleave", properties: {
      $prev_pageview_max_scroll_percentage: 0.8, $prev_pageview_max_content_percentage: 0.75,
      $prev_pageview_last_scroll: 1200, $prev_pageview_duration: 42.5, $prev_pageview_max_content: Infinity,
      $prev_pageview_pathname: "/results/private-id", $prev_pageview_id: "0197e6db-9a73-7b91-9e80-4e1b7158db5c",
      $pageview_id: "teacher@school.be", $prev_pageview_last_content: "private text" } });
    expect(event.properties).toMatchObject({
      $prev_pageview_max_scroll_percentage: 0.8, $prev_pageview_max_content_percentage: 0.75,
      $prev_pageview_last_scroll: 1200, $prev_pageview_duration: 42.5,
      $prev_pageview_pathname: "/results/[analysisId]", $prev_pageview_id: "0197e6db-9a73-7b91-9e80-4e1b7158db5c" });
    expect(event.properties).not.toHaveProperty("$prev_pageview_max_content");
    expect(event.properties).not.toHaveProperty("$pageview_id");
    expect(event.properties).not.toHaveProperty("$prev_pageview_last_content");
  });
});
