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
import { damagedArchive, warmConverter } from "../convex/node/convert";
import { convertsLocally, fileTypeOf, needsConversion } from "../shared/fileTypes";
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
    expect(state.scheduled[0].args).toEqual({ ...args, run: 1 });
    expect(state.tables.analyses[0]).toMatchObject({ status: "preparing", preparationRun: 1 });
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
    expect(state.scheduled[0]).toMatchObject({ delay: 10_000, name: "node/pdf:prepare", args: { ...args, run: 1 } });
    expect(state.tables.analyses[0].recoveryCount).toBe(1);
    expect(spies.captureException).toHaveBeenCalled();

    // The run it replaced reports late: ignored.
    state.tables.analyses[0].recoveryCount = 3;
    await handler(preparationRetry)(state.ctx, { ...args, run: 0, failures });
    expect(state.tables.analyses[0].status).toBe("preparing");

    await handler(preparationRetry)(state.ctx, { ...args, run: 1, failures });
    expect(state.tables.analyses[0]).toMatchObject({ status: "failed", safeError: "conversion_unavailable" });
  });

  it("doesn't fail files another run has finished meanwhile", async () => {
    const state = fakeCtx();
    state.tables.analyses.push(analysis("preparing", { recoveryCount: 3 }) as Row);
    state.tables.files.push(file("f1", "a.docx", { sealedKey: "s1", pageCount: 2, actualBytes: 10 }) as Row);
    await handler(preparationRetry)(state.ctx, { ...args, failures: [{ fileId: "f1", code: "conversion_unavailable" }] });
    expect(state.tables.analyses[0].status).toBe("checking");
  });
});

describe("converter retries", () => {
  // Not a zip format, so these bytes reach the (fake) converter.
  const docx = fileTypeOf("les.doc")!;
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

  const lastRun = true;
  it("treats 500 on every attempt from a healthy converter as a damaged file, in the last run", async () => {
    const { impl, calls } = converter([500, 500, 500, 500], true);
    await expect(convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0], lastRun })).rejects.toThrow("conversion_failed");
    expect(calls).toEqual([...Array(4).fill("/forms/libreoffice/convert"), "/health"]);
  });

  it("leaves the decision to a later run before that", async () => {
    const { impl } = converter([500, 500, 500, 500], true);
    await expect(
      convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0] }),
    ).rejects.toThrow("conversion_unavailable");
  });

  it("refuses a truncated Office archive without asking the converter", async () => {
    const { impl, calls } = converter([], true);
    const zipStart = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(convertWithRetries(zipStart, fileTypeOf("les.docx")!, { fetchImpl: impl, lastRun })).rejects.toThrow("conversion_failed");
    expect(calls).toEqual([]);
  });

  it("retries passing 500s (LibreOffice out of resources)", async () => {
    const { impl } = converter([500, 500], true);
    const pdf = await convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0], lastRun });
    expect(pdf.toString()).toContain("%PDF");
  });

  it("keeps the file when the converter mixes 500s with other outages", async () => {
    const { impl } = converter([500, 503, 500, 500], true);
    await expect(convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0], lastRun })).rejects.toThrow("conversion_unavailable");
  });

  it("keeps the file when the converter itself is down", async () => {
    const { impl } = converter([500, 500, 500, 500], false);
    await expect(convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0], lastRun })).rejects.toThrow("conversion_unavailable");
  });

  it("waits out a cold start", async () => {
    const { impl } = converter([503, 429], true);
    const pdf = await convertWithRetries(Buffer.from("x"), docx, { fetchImpl: impl, pauses: [0, 0, 0], lastRun });
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

describe("local conversion limits", () => {
  it("recognises intact zip archives", async () => {
    const { readFileSync } = await import("node:fs");
    const docx = readFileSync("tests/fixtures/converter/lesson.docx");
    expect(damagedArchive(docx, fileTypeOf("a.docx")!)).toBe(false);
    expect(damagedArchive(docx.subarray(0, docx.length - 30), fileTypeOf("a.docx")!)).toBe(true);
    expect(damagedArchive(Buffer.from("plain text"), fileTypeOf("a.csv")!)).toBe(false);
  });
  it("decodes no image inside Convex: PNGs go to the converter", () => {
    expect(convertsLocally(fileTypeOf("a.png")!)).toBe(false);
    expect(convertsLocally(fileTypeOf("a.jpg")!)).toBe(true);
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

describe("upload error messages", () => {
  it("explains blocked, slow and refused uploads instead of a generic error", async () => {
    const { safeError } = await import("../src/lib/safeError");
    const generic = safeError(new Error("something else"));
    for (const code of ["upload_blocked", "upload_timeout", "upload_rejected"]) {
      const message = safeError(Object.assign(new Error(code), { status: 0 }));
      expect(message).not.toBe(generic);
      expect(message).toContain("kies de ontbrekende bestanden opnieuw");
    }
  });
});
