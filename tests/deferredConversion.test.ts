import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { MutationCtx } from "../convex/_generated/server";
import {
  begin,
  fileSkipped,
  preparationContext,
  preparationRetry,
  prepared,
  sealed,
} from "../convex/workflow";
import { submit } from "../convex/analyses";
import { convertWithRetries } from "../convex/node/pdf";
import { warmConverter } from "../convex/node/convert";
import { fileTypeOf, needsConversion } from "../shared/fileTypes";
import { emailModeAllows } from "../shared/emailPolicy";
import { MAX_TOTAL_BYTES } from "../shared/analysisSchema";
import { tokenHash } from "../convex/access";

const spies = vi.hoisted(() => ({ capture: vi.fn(), captureException: vi.fn() }));
vi.mock("@posthog/convex", () => ({
  PostHog: class { capture = spies.capture; identify = vi.fn(); captureException = spies.captureException; },
}));

type Row = Record<string, unknown> & { _id: string };
const field = (row: Row, path: string) => path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], row);

/** Just enough of Convex's database for the preparation stage. */
function fakeCtx() {
  const tables: Record<string, Row[]> = { analyses: [], files: [], aiRuns: [], analysisGoals: [], goals: [], users: [], catalogs: [], goalSets: [] };
  let n = 0;
  const scheduled: { delay: number; name: string; args: unknown }[] = [];
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
      // Like Convex, a read is a snapshot: later patches don't change it.
      get: async (id: string) => (find(id) ? { ...find(id)! } : null),
      insert: async (table: string, doc: object) => {
        const _id = `${table}${++n}`;
        tables[table].push({ _id, ...doc });
        return _id;
      },
      patch: async (id: string, update: object) => Object.assign(find(id)!, update),
      query,
      normalizeId: (_: string, id: string) => (find(id) ? id : null),
    },
    scheduler: {
      runAfter: async (delay: number, fn: Parameters<typeof getFunctionName>[0], args: unknown) => {
        scheduled.push({ delay, name: getFunctionName(fn), args });
        return `sched${scheduled.length}`;
      },
    },
  } as unknown as MutationCtx;
  return { ctx, tables, scheduled };
}
const handler = <A,>(fn: unknown) => (fn as { _handler: (ctx: MutationCtx, args: A) => Promise<unknown> })._handler;

function analysis(status = "preparing", extra: object = {}) {
  return {
    _id: "a1", status, attempt: 1, recoveryCount: 0, goalIds: ["g1"], goalSetKey: "k", catalogVersion: "1",
    topic: { group: { sourceKey: "s", routeCode: "G" } }, createdAt: 0, updatedAt: 0,
    analyticsContext: { distinctId: "d1", sessionId: "s1", journeyId: "j1", anonymous: true, consent: true, environment: "hosted" },
    ...extra,
  };
}
function file(id: string, name: string, extra: object = {}) {
  return { _id: id, analysisId: "a1", name, status: "ready", declaredBytes: 100, etag: `"${id}"`, stagingKey: `staging/a1/${id}`, updatedAt: 0, ...extra };
}
const args = { analysisId: "a1", attempt: 1 };

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
  spies.capture.mockClear();
  spies.captureException.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("file types", () => {
  it("converts everything except PDFs, and only when the analysis starts", () => {
    expect(needsConversion(fileTypeOf("les.pdf")!)).toBe(false);
    for (const name of ["a.docx", "a.pptx", "a.xlsx", "a.csv", "a.txt", "a.jpg"])
      expect(needsConversion(fileTypeOf(name)!)).toBe(true);
  });
});

describe("submitting", () => {
  const accessToken = "a".repeat(64);
  async function draft(files: object[]) {
    const state = fakeCtx();
    const group = { sourceKey: "s", routeCode: "G" };
    state.tables.analyses.push({
      ...analysis("draft"), capabilityHash: await tokenHash(accessToken), fixture: "development-smoke",
    } as Row);
    state.tables.catalogs.push({ _id: "c1", catalogVersion: "1", status: "published" });
    state.tables.goalSets.push({ _id: "t1", catalogVersion: "1", key: "k", level: "subdomain", goalIds: ["g1"], goalCount: 1, title: "T", path: [], group });
    state.tables.goals.push({ _id: "goal1", catalogVersion: "1", goalId: "g1", group });
    state.tables.files.push(...(files as Row[]));
    return state;
  }
  const credentials = { analysisId: "a1", accessToken, email: "juf@school.be" };
  it("queues uploaded Office files without a page count; the manifest follows later", async () => {
    const state = await draft([file("f1", "les.docx"), file("f2", "les.pdf", { pageCount: 3, actualBytes: 50, sha256: "x" })]);
    await handler(submit)(state.ctx, credentials);
    expect(state.tables.analyses[0]).toMatchObject({ status: "queued", manifest: undefined });
    expect(state.scheduled.map((s) => s.name)).toEqual(["workflow:begin"]);
  });
  it.each([
    ["an Office file without its ETag", file("f1", "les.docx", { etag: undefined })],
    ["a PDF that wasn't read", file("f1", "les.pdf")],
    ["a file still being checked", file("f1", "les.docx", { status: "validating" })],
  ])("refuses %s", async (_, row) => {
    const state = await draft([row]);
    await expect(handler(submit)(state.ctx, credentials)).rejects.toMatchObject({ data: "files_not_ready" });
  });
});

describe("preparation", () => {
  it("retries files that couldn't be read when an analysis is retried", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis("queued") as Row);
    state.tables.files.push(file("f1", "kapot.docx", { status: "invalid", safeError: "conversion_failed" }) as Row);
    await handler(begin)(state.ctx, args);
    expect(state.tables.files[0]).toMatchObject({ status: "ready", safeError: undefined });
    expect(state.scheduled.map((s) => s.name)).toEqual(["node/pdf:prepare"]);
  });

  it("only hands out files that still need a sealed PDF", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis() as Row);
    state.tables.files.push(
      file("f1", "a.docx") as Row,
      file("f2", "b.docx", { sealedKey: "sealed/x" }) as Row,
      file("f3", "c.docx", { status: "removed" }) as Row,
    );
    const context = (await handler(preparationContext)(state.ctx, args)) as { files: Row[] };
    expect(context.files.map((f) => f._id)).toEqual(["f1"]);
  });

  it("records the converted PDF and leaves out unreadable files", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis() as Row);
    state.tables.files.push(file("f1", "a.docx") as Row, file("f2", "kapot.docx") as Row, file("f3", "les.pdf", { pageCount: 3, actualBytes: 50, sha256: "x" }) as Row);
    const info = { actualBytes: 200, pageCount: 4, sha256: "s" };
    expect(await handler(sealed)(state.ctx, { ...args, fileId: "f1", key: "sealed/1", info, durationMs: 5 })).toBe(true);
    expect(state.tables.files[0]).toMatchObject({ ...info, sealedKey: "sealed/1" });
    expect(spies.capture.mock.calls.at(-1)?.[1].event).toBe("file_conversion_completed");

    await handler(fileSkipped)(state.ctx, { ...args, fileId: "f2", code: "conversion_failed" });
    expect(state.tables.files[1]).toMatchObject({ status: "invalid", safeError: "conversion_failed" });
    // A sealed file is never marked unreadable afterwards.
    await handler(fileSkipped)(state.ctx, { ...args, fileId: "f1", code: "conversion_failed" });
    expect(state.tables.files[0].status).toBe("ready");

    // f3 isn't sealed yet: the analysis waits for it.
    await handler(prepared)(state.ctx, args);
    expect(state.tables.analyses[0].status).toBe("preparing");

    await handler(sealed)(state.ctx, { ...args, fileId: "f3", key: "sealed/3" });
    await handler(prepared)(state.ctx, args);
    expect(state.tables.analyses[0]).toMatchObject({
      status: "checking",
      manifest: [
        { fileId: "f1", name: "a.docx", pageCount: 4, bytes: 200 },
        { fileId: "f3", name: "les.pdf", pageCount: 3, bytes: 50 },
      ],
    });
    expect(state.scheduled.map((s) => s.name)).toEqual(["node/openai:startInitialAnalysis"]);
  });

  it("leaves out converted files past the total size limit, in upload order", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis() as Row);
    const half = MAX_TOTAL_BYTES / 2 + 1;
    state.tables.files.push(
      file("f1", "a.pptx", { sealedKey: "s1", pageCount: 1, actualBytes: half }) as Row,
      file("f2", "b.pptx", { sealedKey: "s2", pageCount: 1, actualBytes: half }) as Row,
    );
    await handler(prepared)(state.ctx, args);
    expect(state.tables.files[1]).toMatchObject({ status: "invalid", safeError: "converted_total_too_large" });
    expect((state.tables.analyses[0].manifest as Row[]).map((m) => m.fileId)).toEqual(["f1"]);
  });

  it("fails clearly when no file can be read", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis() as Row);
    state.tables.files.push(file("f1", "kapot.docx", { status: "invalid", safeError: "conversion_failed" }) as Row);
    await handler(prepared)(state.ctx, args);
    expect(state.tables.analyses[0]).toMatchObject({ status: "failed", safeError: "no_readable_files" });
    expect(state.scheduled).toEqual([]);
  });

  it("tries again when the converter is unavailable, then gives up", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis() as Row);
    state.tables.files.push(file("f1", "a.docx") as Row);
    const failures = [{ fileId: "f1", code: "conversion_unavailable" }];
    await handler(preparationRetry)(state.ctx, { ...args, failures });
    expect(state.scheduled[0]).toMatchObject({ delay: 10_000, name: "node/pdf:prepare", args });
    expect(state.tables.analyses[0].recoveryCount).toBe(1);
    expect(spies.captureException).toHaveBeenCalled();

    state.tables.analyses[0].recoveryCount = 3;
    await handler(preparationRetry)(state.ctx, { ...args, failures });
    expect(state.tables.analyses[0]).toMatchObject({ status: "failed", safeError: "conversion_unavailable" });
  });
});

describe("converter retries", () => {
  const docx = fileTypeOf("les.docx")!;
  beforeEach(() => {
    vi.stubEnv("CONVERTER_URL", "https://convert.example");
    vi.stubEnv("CONVERTER_USERNAME", "u");
    vi.stubEnv("CONVERTER_PASSWORD", "p");
  });
  function converter(convert: number[], healthy: boolean) {
    const calls: string[] = [];
    const impl = (async (url: string) => {
      calls.push(new URL(url).pathname);
      if (url.endsWith("/health")) return new Response("{}", { status: healthy ? 200 : 503 });
      const status = convert.shift() ?? 200;
      return new Response(status === 200 ? "%PDF-1.7\n" : "LibreOffice failed", { status });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it("treats a repeated 500 from a healthy converter as a damaged file", async () => {
    const { impl, calls } = converter([500, 500, 500, 500], true);
    await expect(convertWithRetries(Buffer.from("x"), docx, impl, [0, 0, 0])).rejects.toThrow("conversion_failed");
    expect(calls).toEqual(["/forms/libreoffice/convert", "/forms/libreoffice/convert", "/health"]);
  });

  it("keeps the file when the converter itself is down", async () => {
    const { impl } = converter([500, 500, 500, 500], false);
    await expect(convertWithRetries(Buffer.from("x"), docx, impl, [0, 0, 0])).rejects.toThrow("conversion_unavailable");
  });

  it("waits out a cold start", async () => {
    const { impl } = converter([503, 429], true);
    const pdf = await convertWithRetries(Buffer.from("x"), docx, impl, [0, 0, 0]);
    expect(pdf.toString()).toContain("%PDF");
  });

  it("wakes the converter with its credentials and ignores failures", async () => {
    const { impl, calls } = converter([], true);
    expect(await warmConverter(impl)).toBe(true);
    expect(calls).toEqual(["/health"]);
    expect(await warmConverter((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe(false);
    vi.stubEnv("CONVERTER_URL", "");
    expect(await warmConverter(impl)).toBe(false);
  });
});

describe("report e-mail promise", () => {
  it("follows EMAIL_MODE", () => {
    expect(emailModeAllows("juf@school.be", { EMAIL_MODE: "live" })).toBe(true);
    expect(emailModeAllows("Juf@School.be ", { EMAIL_MODE: "allowlist", EMAIL_ALLOWLIST: "a@b.be, juf@school.be" })).toBe(true);
    expect(emailModeAllows("meester@school.be", { EMAIL_MODE: "allowlist", EMAIL_ALLOWLIST: "juf@school.be" })).toBe(false);
    expect(emailModeAllows("juf@school.be", {})).toBe(false);
  });
});
