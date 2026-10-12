import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";
import { markSent, recordEvent, startWelcome, unsubscribe, welcomeDelay } from "../convex/emails";
import { unsubscribeToken } from "../shared/email/signing";

const spies = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@posthog/convex", () => ({ PostHog: class { capture = spies.capture; identify = vi.fn(); captureException = vi.fn(); } }));

type Row = Record<string, unknown> & { _id: string };
/** Just enough of Convex's database for the e-mail bookkeeping: eq-only index queries. */
function fakeCtx() {
  const tables: Record<string, Row[]> = { users: [], emailMessages: [] };
  let n = 0;
  const scheduled: { at: number; args: unknown }[] = [];
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => tables[table].filter((r) => filters.every(([f, v]) => r[f] === v));
    const api = {
      withIndex: (_: string, build?: (q: unknown) => unknown) => {
        const q = { eq: (f: string, v: unknown) => (filters.push([f, v]), q) };
        build?.(q);
        return api;
      },
      first: async () => rows()[0] ?? null,
      unique: async () => rows()[0] ?? null,
      collect: async () => rows(),
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

async function newUser(t: ReturnType<typeof fakeCtx>, email: string) {
  return (await t.ctx.db.insert("users", { email, emailKey: email.toLowerCase(), emailVerified: false, createdAt: NOW, updatedAt: NOW })) as Id<"users">;
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
    const sent = handler<{ messageId: string; providerId: string; template: string }>(markSent);
    await sent(t.ctx, { messageId: t.tables.emailMessages[0]._id, providerId: "p1", template: "welcome-1-analysis" });
    expect(t.tables.emailMessages[1]).toMatchObject({ step: 2, sendAt: NOW + 2 * 24 * 60 * 60 * 1000 });
    vi.setSystemTime(NOW + 2 * 24 * 60 * 60 * 1000);
    await sent(t.ctx, { messageId: t.tables.emailMessages[1]._id, providerId: "p2", template: "welcome-2-analysis" });
    expect(t.tables.emailMessages[2]).toMatchObject({ step: 3, sendAt: NOW + 5 * 24 * 60 * 60 * 1000 });
    await sent(t.ctx, { messageId: t.tables.emailMessages[2]._id, providerId: "p3", template: "welcome-3" });
    expect(t.tables.emailMessages).toHaveLength(3);
    expect(t.tables.users[0].welcome).toMatchObject({ status: "completed" });
  });

  it("only shortens the delays for testing, never when live", () => {
    vi.stubEnv("WELCOME_DELAY_SCALE", "0.001");
    expect(welcomeDelay(2)).toBe(2 * 24 * 60 * 60 * 1000);
    vi.stubEnv("EMAIL_MODE", "allowlist");
    expect(welcomeDelay(2)).toBe(172_800);
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
  const event = handler<{ type: string; providerId: string; at: number; bounceType?: string }>(recordEvent);

  it("suppresses the address after a permanent bounce and cancels what was still planned", async () => {
    const { t } = await welcomeInFlight();
    await event(t.ctx, { type: "email.bounced", providerId: "p1", at: NOW, bounceType: "Permanent" });
    expect(t.tables.emailMessages[0].status).toBe("bounced");
    expect(t.tables.users[0]).toMatchObject({ emailSuppressedReason: "bounced", welcome: { status: "stopped" } });
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

  it("records the first open and click once, flagging scanner clicks", async () => {
    const { t } = await welcomeInFlight();
    await event(t.ctx, { type: "email.delivered", providerId: "p1", at: NOW });
    spies.capture.mockClear();
    await event(t.ctx, { type: "email.clicked", providerId: "p1", at: NOW + 3000 });
    await event(t.ctx, { type: "email.clicked", providerId: "p1", at: NOW + 60_000 });
    expect(t.tables.emailMessages[0]).toMatchObject({ clickedAt: NOW + 3000, clickCount: 2 });
    expect(spies.capture).toHaveBeenCalledTimes(1);
    expect(spies.capture.mock.calls[0][1]).toMatchObject({
      event: "email_message_clicked",
      properties: expect.objectContaining({ is_bot_suspected: true, email_kind: "welcome" }),
    });
  });
});

describe("unsubscribe", () => {
  it("stops the sequence for a valid link and refuses a forged one", async () => {
    vi.stubEnv("EMAIL_LINK_SECRET", "link-secret");
    const t = fakeCtx();
    const user = await newUser(t, "juf@school.be");
    await startWelcome(t.ctx, user, "analysis", context);
    const run = handler<{ token: string }>(unsubscribe);
    await expect(run(t.ctx, { token: await unsubscribeToken(user, "other-secret") })).rejects.toThrow();
    await run(t.ctx, { token: await unsubscribeToken(user, "link-secret") });
    expect(t.tables.users[0]).toMatchObject({ emailUnsubscribedAt: NOW, welcome: { status: "stopped", stoppedReason: "unsubscribed" } });
    expect(t.tables.emailMessages[0].status).toBe("cancelled");
  });
});
