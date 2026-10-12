import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import {
  afterQuotaReset,
  claim,
  markRetry,
  markSent,
  recordEvent,
  recoverInterrupted,
  startWelcome,
  unsubscribe,
  welcomeDelay,
  withdrawEmailAnalytics,
} from "../convex/emails";
import { unsubscribeToken } from "../shared/email/signing";

const spies = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@posthog/convex", () => ({ PostHog: class { capture = spies.capture; identify = vi.fn(); captureException = vi.fn(); } }));

type Row = Record<string, unknown> & { _id: string };
const field = (row: Row, path: string) => path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], row);

/** Just enough of Convex's database for the e-mail bookkeeping: eq/lt index queries. */
function fakeCtx() {
  const tables: Record<string, Row[]> = { users: [], emailMessages: [], analyses: [], webhookEvents: [] };
  let n = 0;
  const scheduled: { at: number; args: unknown }[] = [];
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const api = {
      withIndex: (_: string, build?: (q: unknown) => unknown) => {
        const q = {
          eq: (f: string, v: unknown) => (filters.push((r) => field(r, f) === v), q),
          lt: (f: string, v: number) => (filters.push((r) => (field(r, f) as number) < v), q),
        };
        build?.(q);
        return api;
      },
      first: async () => rows()[0] ?? null,
      unique: async () => rows()[0] ?? null,
      collect: async () => rows(),
      take: async (count: number) => rows().slice(0, count),
    };
    return api;
  };
  const find = (id: string) => Object.values(tables).flat().find((r) => r._id === id) ?? null;
  const ctx = {
    db: {
      get: async (id: string) => find(id),
      insert: async (table: string, doc: object) => {
        const _id = `${table.slice(0, 4).toLowerCase()}${String(++n).padStart(28, "0")}`;
        tables[table].push({ _id, ...doc });
        return _id;
      },
      patch: async (id: string, update: object) => Object.assign(find(id)!, update),
      delete: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const i = rows.findIndex((r) => r._id === id);
          if (i >= 0) rows.splice(i, 1);
        }
      },
      query,
      normalizeId: (_: string, id: string) => (find(id) ? id : null),
    },
    scheduler: {
      runAt: async (at: number, _fn: unknown, args: unknown) => (scheduled.push({ at, args }), `sched${scheduled.length}`),
      cancel: vi.fn(async () => {}),
    },
  } as unknown as MutationCtx;
  return { ctx, tables, scheduled };
}
const handler = <A,>(fn: unknown) => (fn as { _handler: (ctx: MutationCtx, args: A) => Promise<unknown> })._handler;
const context = { distinctId: "d1", sessionId: "s1", journeyId: "j1", anonymous: true, consent: true as const, environment: "hosted" as const };
const NOW = Date.UTC(2026, 9, 12, 16);
const DAY = 24 * 60 * 60 * 1000;

async function newUser(t: ReturnType<typeof fakeCtx>, email: string) {
  return (await t.ctx.db.insert("users", { email, emailKey: email.toLowerCase(), emailVerified: false, createdAt: NOW, updatedAt: NOW })) as Id<"users">;
}
const claimIt = handler<{ messageId: string }>(claim) as (ctx: MutationCtx, a: { messageId: string }) => Promise<number | null>;
const sent = handler<{ messageId: string; attempt: number; providerId: string; template: string }>(markSent);
/** Claims a message the way the delivery action does, then reports it sent. */
async function deliverOk(t: ReturnType<typeof fakeCtx>, row: Row, providerId: string, template: string) {
  const attempt = (await claimIt(t.ctx, { messageId: row._id }))!;
  await sent(t.ctx, { messageId: row._id, attempt, providerId, template });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "token");
  vi.stubEnv("EMAIL_MODE", "live");
  spies.capture.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("welcome sequence", () => {
  it("starts an hour after the address is first entered, once per mailbox", async () => {
    const t = fakeCtx();
    const first = await newUser(t, "Juf.An@School.be");
    const second = await newUser(t, "juf.an@school.be");
    await startWelcome(t.ctx, first, "analysis", context);
    await startWelcome(t.ctx, second, "reminder", context);
    expect(t.tables.emailMessages).toHaveLength(1);
    expect(t.tables.emailMessages[0]).toMatchObject({ kind: "welcome", step: 1, status: "scheduled", sendAt: NOW + 60 * 60 * 1000 });
    expect(t.scheduled[0].at).toBe(NOW + 60 * 60 * 1000);
  });

  it("schedules step 2 two days after step 1 and step 3 three days after step 2, then completes", async () => {
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    await startWelcome(t.ctx, user, "analysis", context);
    await deliverOk(t, t.tables.emailMessages[0], "p1", "welcome-1-analysis");
    expect(t.tables.emailMessages[1]).toMatchObject({ step: 2, sendAt: NOW + 2 * DAY });
    vi.setSystemTime(NOW + 2 * DAY);
    await deliverOk(t, t.tables.emailMessages[1], "p2", "welcome-2-analysis");
    expect(t.tables.emailMessages[2]).toMatchObject({ step: 3, sendAt: NOW + 5 * DAY });
    await deliverOk(t, t.tables.emailMessages[2], "p3", "welcome-3");
    expect(t.tables.emailMessages).toHaveLength(3);
    expect(t.tables.users[0].welcome).toMatchObject({ status: "completed" });
  });

  it("only shortens the delays for testing, never when live", () => {
    vi.stubEnv("WELCOME_DELAY_SCALE", "0.001");
    expect(welcomeDelay(2)).toBe(2 * DAY);
    vi.stubEnv("EMAIL_MODE", "allowlist");
    expect(welcomeDelay(2)).toBe(172_800);
  });
});

describe("delivery attempts", () => {
  async function queued() {
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    await startWelcome(t.ctx, user, "analysis", context);
    return { t, m: t.tables.emailMessages[0] };
  }

  it("lets only one run claim a message, and ignores a run that outlived its lease", async () => {
    const { t, m } = await queued();
    const first = await claimIt(t.ctx, { messageId: m._id });
    expect(await claimIt(t.ctx, { messageId: m._id })).toBeNull();
    // The first run hangs; recovery reschedules it and a second run takes over.
    vi.setSystemTime(NOW + 20 * 60 * 1000);
    await handler<object>(recoverInterrupted)(t.ctx, {});
    expect(m).toMatchObject({ status: "scheduled", errorCode: "delivery_interrupted" });
    const second = await claimIt(t.ctx, { messageId: m._id });
    expect(second).toBe(first! + 1);
    // The old run finishing late must not overwrite the new attempt.
    await sent(t.ctx, { messageId: m._id, attempt: first!, providerId: "stale", template: "welcome-1-analysis" });
    expect(m).toMatchObject({ status: "sending", attempts: second });
  });

  it("waits for the daily quota reset without using up a retry, and gives up after three days", async () => {
    const { t, m } = await queued();
    const retry = handler<{ messageId: string; attempt: number; errorCode: string }>(markRetry);
    const attempt = (await claimIt(t.ctx, { messageId: m._id }))!;
    await retry(t.ctx, { messageId: m._id, attempt, errorCode: "quota_exceeded" });
    expect(m).toMatchObject({ status: "scheduled", attempts: 0, sendAt: afterQuotaReset(NOW) });
    expect(new Date(afterQuotaReset(NOW)).toISOString()).toBe("2026-10-13T00:05:00.000Z");
    vi.setSystemTime(NOW + 4 * DAY);
    const late = (await claimIt(t.ctx, { messageId: m._id }))!;
    await retry(t.ctx, { messageId: m._id, attempt: late, errorCode: "quota_exceeded" });
    expect(m).toMatchObject({ status: "failed", errorCode: "quota_exceeded" });
  });

  it("fails after five transient retries", async () => {
    const { t, m } = await queued();
    const retry = handler<{ messageId: string; attempt: number; errorCode: string }>(markRetry);
    for (let i = 0; i < 6; i++) {
      const attempt = (await claimIt(t.ctx, { messageId: m._id }))!;
      await retry(t.ctx, { messageId: m._id, attempt, errorCode: "email_provider_error" });
    }
    expect(m).toMatchObject({ status: "failed", attempts: 6 });
  });
});

describe("webhook events", () => {
  async function welcomeInFlight() {
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    await startWelcome(t.ctx, user, "analysis", context);
    const m = t.tables.emailMessages[0];
    Object.assign(m, { status: "sent", providerId: "p1", sentAt: NOW });
    // Step 2 is waiting.
    t.tables.emailMessages.push({ ...m, _id: "emai2000000000000000000000000000", step: 2, status: "scheduled", providerId: undefined, scheduledFunctionId: "s2", dedupeKey: "w2" });
    return { t, user };
  }
  let id = 0;
  const run = handler<{ eventId: string; type: string; providerId: string; at: number; bounceType?: string }>(recordEvent);
  const event = (ctx: MutationCtx, e: { type: string; providerId: string; at: number; bounceType?: string; eventId?: string }) =>
    run(ctx, { eventId: `msg_${++id}`, ...e });

  it("suppresses every capitalisation of the mailbox after a permanent bounce", async () => {
    const { t } = await welcomeInFlight();
    const other = await newUser(t, "Juf@School.be");
    await event(t.ctx, { type: "email.bounced", providerId: "p1", at: NOW, bounceType: "Permanent" });
    expect(t.tables.emailMessages[0].status).toBe("bounced");
    expect(t.tables.users[0]).toMatchObject({ emailSuppressedReason: "bounced", welcome: { status: "stopped" } });
    expect((await t.ctx.db.get(other))!.emailSuppressedReason).toBe("bounced");
    expect(t.tables.emailMessages[1].status).toBe("cancelled");
  });

  it("does not suppress on a transient bounce", async () => {
    const { t } = await welcomeInFlight();
    await event(t.ctx, { type: "email.bounced", providerId: "p1", at: NOW, bounceType: "Transient" });
    expect(t.tables.users[0].emailSuppressedAt).toBeUndefined();
  });

  it("never moves delivery status backwards", async () => {
    const { t } = await welcomeInFlight();
    await event(t.ctx, { type: "email.delivered", providerId: "p1", at: NOW + 1000 });
    await event(t.ctx, { type: "email.delivery_delayed", providerId: "p1", at: NOW + 2000 });
    expect(t.tables.emailMessages[0]).toMatchObject({ status: "delivered", deliveredAt: NOW + 1000 });
  });

  it("records the first open and click once, flagging scanner clicks, and ignores replays", async () => {
    const { t } = await welcomeInFlight();
    await event(t.ctx, { type: "email.delivered", providerId: "p1", at: NOW });
    spies.capture.mockClear();
    await event(t.ctx, { type: "email.clicked", providerId: "p1", at: NOW + 3000, eventId: "click-1" });
    expect(await run(t.ctx, { eventId: "click-1", type: "email.clicked", providerId: "p1", at: NOW + 3000 })).toBe("duplicate");
    await event(t.ctx, { type: "email.clicked", providerId: "p1", at: NOW + 60_000 });
    expect(t.tables.emailMessages[0]).toMatchObject({ clickedAt: NOW + 3000, clickCount: 2 });
    expect(spies.capture).toHaveBeenCalledTimes(1);
    expect(spies.capture.mock.calls[0][1]).toMatchObject({
      event: "email_message_clicked",
      properties: expect.objectContaining({ is_bot_suspected: true, email_kind: "welcome" }),
    });
  });

  it("reports events for unknown messages so recent ones are retried", async () => {
    const { t } = await welcomeInFlight();
    expect(await event(t.ctx, { type: "email.delivered", providerId: "not-yet-stored", at: NOW })).toBe("unknown");
    expect(t.tables.webhookEvents).toHaveLength(0);
  });
});

describe("unsubscribe and consent", () => {
  it("stops the sequence for every capitalisation of a valid link's mailbox and refuses a forged one", async () => {
    vi.stubEnv("EMAIL_LINK_SECRET", "link-secret");
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    const other = await newUser(t, "Juf@School.be");
    await startWelcome(t.ctx, user, "analysis", context);
    const run = handler<{ token: string }>(unsubscribe);
    await expect(run(t.ctx, { token: await unsubscribeToken(user, "other-secret") })).rejects.toThrow();
    await run(t.ctx, { token: await unsubscribeToken(user, "link-secret") });
    expect(t.tables.users[0]).toMatchObject({ emailUnsubscribedAt: NOW, welcome: { status: "stopped", stoppedReason: "unsubscribed" } });
    expect((await t.ctx.db.get(other))!.emailUnsubscribedAt).toBe(NOW);
    expect(t.tables.emailMessages[0].status).toBe("cancelled");
  });

  it("forgets the analytics context of a contact's e-mails when consent is withdrawn", async () => {
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    await startWelcome(t.ctx, user, "analysis", context);
    await withdrawEmailAnalytics(t.ctx, user);
    expect(t.tables.emailMessages[0].analyticsContext).toBeUndefined();
    spies.capture.mockClear();
    await deliverOk(t, t.tables.emailMessages[0], "p1", "welcome-1-analysis");
    // Neither the sent event nor the next step (which copies the context) reports anything.
    expect(spies.capture).not.toHaveBeenCalled();
    expect(t.tables.emailMessages[1].analyticsContext).toBeUndefined();
  });
});
