import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { captureAnalysis, captureAnalysisException, identifyContact, validAnalyticsContext } from "../convex/analytics";
import { providerTerminal, failed } from "../convex/workflow";

const spies = vi.hoisted(() => ({ capture: vi.fn(), identify: vi.fn(), captureException: vi.fn() }));
vi.mock("@posthog/convex", () => ({ PostHog: class {
  capture = spies.capture;
  identify = spies.identify;
  captureException = spies.captureException;
} }));

function analysis(overrides: Partial<Doc<"analyses">> = {}) {
  return {
    _id: "analysis-one", _creationTime: 1,
    status: "checking", attempt: 1, goalIds: ["goal-one"],
    goalSetKey: "subject-one", catalogVersion: "catalog-v1", createdAt: 1,
    submittedAt: 2, updatedAt: 3,
    topic: { group: { sourceKey: "group-one", routeCode: "bao" } },
    analyticsContext: { distinctId: "anonymous-one", sessionId: "session-one", journeyId: "journey-one",
      consent: true, anonymous: true, environment: "hosted" },
    ...overrides,
  } as Doc<"analyses">;
}
function context(rows: Record<string, unknown> = {}) {
  const patch = vi.fn(async (id: string, update: object) => {
    rows[id] = { ...(rows[id] as object), ...update };
  });
  return { ctx: { db: { get: vi.fn(async (id: string) => rows[id] ?? null), patch },
    scheduler: { runAfter: vi.fn(async () => "scheduled-one") } } as unknown as MutationCtx, patch, rows };
}
type TerminalArgs = { runId: string; generation: number; isError: boolean; inputTokens?: number; outputTokens?: number };
const terminal = (providerTerminal as unknown as { _handler: (ctx: MutationCtx, args: TerminalArgs) => Promise<void> })._handler;
const fail = (failed as unknown as { _handler: (ctx: MutationCtx, args: { runId: string; generation: number; code: string; retryable: boolean; interrupted: boolean }) => Promise<void> })._handler;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "test-token");
  vi.stubEnv("POSTHOG_ENABLE_LOCAL", "false");
  spies.capture.mockResolvedValue(undefined);
  spies.identify.mockResolvedValue(undefined);
  spies.captureException.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("backend analytics privacy and availability", () => {
  it("requires consent and suppresses local and fixture traffic", async () => {
    const { ctx } = context();
    for (const a of [analysis({ analyticsContext: undefined }),
      analysis({ fixture: "development-smoke" }), analysis({ testMode: "deterministic" }),
      analysis({ analyticsContext: { ...analysis().analyticsContext!, environment: "local" } })]) {
      await captureAnalysis(ctx, a, "analysis_started");
      await captureAnalysisException(ctx, a, "provider_timeout", "analysis");
    }
    expect(spies.capture).not.toHaveBeenCalled();
    expect(spies.captureException).not.toHaveBeenCalled();
  });

  it("fails open and sends only allowlisted metadata", async () => {
    const { ctx } = context();
    spies.capture.mockRejectedValueOnce(new Error("private token in upstream response"));
    await expect(captureAnalysis(ctx, analysis(), "analysis_failed", {
      file_count: 3, filename: "private.pdf", error_code: "https://signed.example/?token=secret",
    })).resolves.toBeUndefined();
    const properties = spies.capture.mock.calls[0][1].properties;
    expect(properties.file_count).toBe(3);
    expect(properties.filename).toBeUndefined();
    expect(properties.error_code).toBeUndefined();
  });

  it("identifies the exact application contact and lowercase email domain", async () => {
    const a = analysis({ userId: "contact-one" as Doc<"analyses">["userId"] });
    const { ctx } = context({ "contact-one": { _id: "contact-one", email: "Teacher+Math@School.BE" } });
    await identifyContact(ctx, a);
    const payload = spies.identify.mock.calls[0][1];
    expect(payload.distinctId).toBe("contact-one");
    expect(payload.properties.$set).toMatchObject({ email: "Teacher+Math@School.BE", email_domain: "school.be", email_verified: false });
    expect(payload.properties.$anon_distinct_id).toBe("anonymous-one");
    await identifyContact(ctx, { ...a, analyticsContext: { ...a.analyticsContext!, anonymous: false, distinctId: "previous-contact" } });
    expect(spies.identify.mock.calls[1][1].properties).not.toHaveProperty("$anon_distinct_id");
  });

  it("ignores context identifiers containing credentials or email addresses", () => {
    expect(validAnalyticsContext({ ...analysis().analyticsContext!, distinctId: "person@school.be" })).toBeUndefined();
    expect(validAnalyticsContext({ ...analysis().analyticsContext!, sessionId: "https://signed.example" })).toBeUndefined();
    expect(validAnalyticsContext(analysis().analyticsContext)).toBeDefined();
  });

  it("sanitizes exception messages before scheduling them", async () => {
    const { ctx } = context();
    await captureAnalysisException(ctx, analysis(), "teacher@school.be signed https://example.com", "ai_generation");
    const payload = spies.captureException.mock.calls[0][1];
    expect(payload.error.message).toBe("ai_generation: unexpected_error");
    expect(JSON.stringify(payload)).not.toContain("teacher@school.be");
  });
});

describe("provider generation event consistency", () => {
  it("captures final usage once despite repeated polls and separately after a generation retry", async () => {
    const a = analysis();
    const run = { _id: "run-one", analysisId: a._id, attempt: 1, generation: 1,
      stage: "initial", status: "polling", retryCount: 0, updatedAt: Date.now(),
      generationStartedAt: Date.now() - 1000, requestShape: { model: "test-model" } };
    const state = context({ "analysis-one": a, "run-one": run });
    const args = { runId: "run-one", generation: 1, isError: false, inputTokens: 123, outputTokens: 45 };
    await terminal(state.ctx, args);
    await terminal(state.ctx, args);
    expect(spies.capture).toHaveBeenCalledTimes(1);
    expect(spies.capture.mock.calls[0][1]).toMatchObject({ event: "$ai_generation", properties: { $ai_input_tokens: 123, $ai_output_tokens: 45 } });
    state.rows["run-one"] = { ...(state.rows["run-one"] as object), generation: 2 };
    await terminal(state.ctx, { ...args, generation: 1 });
    expect(spies.capture).toHaveBeenCalledTimes(1);
    await terminal(state.ctx, { ...args, generation: 2 });
    expect(spies.capture).toHaveBeenCalledTimes(2);
  });

  it("does not capture a later terminal callback after consent is revoked", async () => {
    const a = analysis({ analyticsContext: undefined });
    const state = context({ "analysis-one": a, "run-one": {
      _id: "run-one", analysisId: a._id, attempt: 1, generation: 1,
      stage: "initial", status: "polling", retryCount: 0,
    } });
    await terminal(state.ctx, { runId: "run-one", generation: 1, isError: false, inputTokens: 123 });
    expect(spies.capture).not.toHaveBeenCalled();
  });

  it("ignores repeated failed recheck callbacks after the goal has settled", async () => {
    const a = analysis({ status: "rechecking" });
    const state = context({ "analysis-one": a, "run-one": {
      _id: "run-one", analysisId: a._id, attempt: 1, generation: 1,
      stage: "recheck", status: "failed", retryCount: 2,
    } });
    await fail(state.ctx, { runId: "run-one", generation: 1, code: "provider_transient", retryable: false, interrupted: false });
    expect(state.patch).not.toHaveBeenCalled();
    expect(spies.capture).not.toHaveBeenCalled();
  });
});
