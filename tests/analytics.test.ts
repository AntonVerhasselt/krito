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
    expect(sdk.startSessionRecording).not.toHaveBeenCalled();
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
  it("resets before switching known contacts and identifies only valid opaque IDs", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted"); sdk.get_property.mockReturnValue("firstcontact123");
    analytics.identifyContact("secondcontact456");
    expect(sdk.reset).toHaveBeenCalledTimes(1); expect(sdk.identify).toHaveBeenCalledWith("secondcontact456");
    analytics.identifyContact("teacher@school.be"); expect(sdk.identify).toHaveBeenCalledTimes(1);
  });
  it("scrubs SDK URLs/exceptions and disables network/console/document capture", async () => {
    const analytics = await import("../src/lib/analytics");
    analytics.setAnalyticsConsent("granted");
    const config = sdk.init.mock.calls[0][1];
    expect(config).toMatchObject({ autocapture: false, enable_recording_console_log: false,
      disable_session_recording: true });
    expect(config.session_recording).toBeUndefined();
    expect(config.loaded).toBeUndefined();
    expect(config.before_send({ event: "$snapshot", properties: { snapshot_data: "private content" } })).toBeNull();
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
  });
});
