import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { deliver, sendSamples } from "../convex/node/email";
import { demoReportInput } from "./fixtures/report";

const resend = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: resend.send }; } }));

type Delivery = Record<string, unknown> & { message: Record<string, unknown>; user: Record<string, unknown> };
function delivery(overrides: { message?: Record<string, unknown>; user?: Record<string, unknown> } & Record<string, unknown> = {}): Delivery {
  const { message, user, ...rest } = overrides;
  return {
    message: { _id: "message-1", userId: "kd7d23e3ah6e628kgv8bv70vg58g5hrr", kind: "welcome", step: 1, attempts: 1, ...message },
    user: { email: "juf.an@school.be", suppressed: false, unsubscribed: false, welcomeActive: true, ...user },
    hasCompletedAnalysis: true,
    report: null,
    topic: null,
    reminder: null,
    ...rest,
  };
}

/** Runs the action with the bookkeeping mutations recorded instead of executed. */
async function run(d: Delivery | null, claimed: number | null = 1) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const ctx = {
    runMutation: vi.fn(async (ref: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      calls.push({ name, args });
      return name === "emails:claim" ? claimed : null;
    }),
    runQuery: vi.fn(async () => {
      if (d instanceof Error) throw d;
      return d;
    }),
  };
  await (deliver as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, { messageId: "message-1" });
  return calls.filter((c) => c.name !== "emails:claim");
}

beforeEach(() => {
  vi.stubEnv("EMAIL_MODE", "allowlist");
  vi.stubEnv("EMAIL_ALLOWLIST", "Juf.An@school.be, other@school.be");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_LINK_SECRET", "link-secret");
  vi.stubEnv("EMAIL_REPLY_TO", "anton.verhasselt@gmail.com");
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  resend.send.mockReset().mockResolvedValue({ data: { id: "provider-1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("delivery action", () => {
  it("does nothing when another run owns the message", async () => {
    expect(await run(delivery(), null)).toEqual([]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("skips addresses that are not allowed by EMAIL_MODE, and suppressed mailboxes", async () => {
    vi.stubEnv("EMAIL_MODE", "off");
    expect(await run(delivery())).toEqual([{ name: "emails:markSkipped", args: { messageId: "message-1", attempt: 1, reason: "email_disabled" } }]);
    vi.stubEnv("EMAIL_MODE", "live");
    expect((await run(delivery({ user: { suppressed: true } })))[0].args.reason).toBe("email_suppressed");
    expect((await run(delivery({ user: { unsubscribed: true } })))[0].args.reason).toBe("unsubscribed");
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("sends welcome 1 with the inline photo, unsubscribe headers and a stable idempotency key", async () => {
    const calls = await run(delivery());
    const [payload, options] = resend.send.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: "krito-message-1" });
    expect(payload).toMatchObject({ to: ["juf.an@school.be"], replyTo: "anton.verhasselt@gmail.com", subject: "Klopte het?" });
    expect(payload.attachments).toEqual([expect.objectContaining({ contentId: "anton-charlotte", contentType: "image/jpeg" })]);
    expect(payload.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/example\.convex\.site\/unsubscribe\?t=/);
    expect(payload.text).toContain("https://www.krito.be/uitschrijven?t=");
    expect(calls.map((c) => c.name)).toEqual(["emails:noteTemplate", "emails:markSent"]);
    expect(calls[1].args).toMatchObject({ attempt: 1, providerId: "provider-1", template: "welcome-1-analysis" });
  });

  it("keeps the variant chosen at the first attempt", async () => {
    const calls = await run(delivery({ message: { template: "welcome-1-no-analysis" }, hasCompletedAnalysis: true }));
    expect(resend.send.mock.calls[0][0].subject).toBe("Even voorstellen: ik ben Anton");
    expect(calls.map((c) => c.name)).toEqual(["emails:markSent"]);
  });

  it("attaches the pdf report", async () => {
    await run(delivery({ message: { kind: "report", step: undefined, analysisId: "analysis-1" }, report: demoReportInput() }));
    const payload = resend.send.mock.calls[0][0];
    expect(payload.subject).toBe("Je verslag: Magnetisme, 3de leerjaar");
    expect(payload.headers).toBeUndefined();
    const [pdf] = payload.attachments;
    expect(pdf).toMatchObject({ filename: "Krito - Magnetisme 3de leerjaar - 2026-10-12.pdf", contentType: "application/pdf" });
    expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("retries transient errors and full quotas, fails on rejected requests and idempotency conflicts", async () => {
    const cases = [
      [{ name: "rate_limit_exceeded", statusCode: 429 }, "emails:markRetry", "email_provider_error"],
      [{ name: "internal_server_error", statusCode: 500 }, "emails:markRetry", "email_provider_error"],
      [{ name: "daily_quota_exceeded", statusCode: 429 }, "emails:markRetry", "quota_exceeded"],
      [{ name: "monthly_quota_exceeded", statusCode: 429 }, "emails:markRetry", "monthly_quota_exceeded"],
      [{ name: "invalid_idempotent_request", statusCode: 409 }, "emails:markFailed", "idempotency_conflict"],
      [{ name: "validation_error", statusCode: 422 }, "emails:markFailed", "email_provider_error"],
    ] as const;
    for (const [error, name, errorCode] of cases) {
      resend.send.mockResolvedValueOnce({ data: null, error: { ...error, message: "x" } });
      const calls = await run(delivery({ message: { template: "welcome-1-analysis" } }));
      expect(calls.at(-1), error.name).toEqual({ name, args: { messageId: "message-1", attempt: 1, errorCode } });
    }
    resend.send.mockRejectedValueOnce(new Error("network down"));
    expect((await run(delivery({ message: { template: "welcome-1-analysis" } }))).at(-1)!.name).toBe("emails:markRetry");
  });

  it("sends the sample report e-mail with a real pdf attached", async () => {
    vi.stubEnv("EMAIL_ALLOWLIST", "anton@school.be");
    await (sendSamples as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler({}, { to: "anton@school.be", only: "report" });
    const [pdf] = resend.send.mock.calls[0][0].attachments;
    expect(pdf).toMatchObject({ contentType: "application/pdf", filename: "Krito - Magnetisme 3de leerjaar - 2026-10-12.pdf" });
    expect(pdf.content.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("retries instead of getting stuck when loading the data fails", async () => {
    const calls = await run(new Error("query failed") as unknown as Delivery);
    expect(calls).toEqual([{ name: "emails:markRetry", args: { messageId: "message-1", attempt: 1, errorCode: "delivery_interrupted" } }]);
  });
});
