import assert from "node:assert/strict";
import { AssertionError } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { api } from "../convex/_generated/api";
import { assertDevelopment, cli, development } from "./lib";
import type { Id } from "../convex/_generated/dataModel";
assertDevelopment();
const real = process.argv.includes("--real");
const client = new ConvexHttpClient(development.convexUrl);
const fixtureIds: Id<"analyses">[] = [];
export function internalCall<T>(name: string, args: unknown): T {
  const output = cli("npx", [
    "convex",
    "run",
    name,
    JSON.stringify(args),
    "--deployment",
    development.convexDeployment.slice(4),
  ]);
  return output.trim() ? (JSON.parse(output) as T) : (undefined as T);
}
async function pdf(lines: string[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  lines.forEach((line, index) =>
    page.drawText(line, { x: 40, y: 740 - index * 24, font, size: 12 }),
  );
  return Buffer.from(await doc.save());
}
async function waitUntil<T>(
  get: () => Promise<T>,
  done: (value: T) => boolean,
  seconds: number,
): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const value = await get();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Development workflow smoke timed out");
}
let stage = "catalog";
async function run() {
  const catalog = await client.query(api.goals.catalogInfo, {});
  assert(catalog);
  const search = await client.query(api.goals.listGoalSets, {
    search: "2.1.GL3.19",
    catalogVersion: catalog.version,
  });
  const topic = search.topics[0];
  assert(topic);
  assert.equal(topic.goalCount, 11);
  const accessToken = randomBytes(32).toString("hex"),
    capabilityHash = createHash("sha256").update(accessToken).digest("hex");
  const analysisId = await client.mutation(api.analyses.createDraft, {
    capabilityHash,
    catalogVersion: catalog.version,
    goalSetKey: topic.key,
  });
  fixtureIds.push(analysisId);
  stage = "mark-fixture";
  internalCall("testHarness:markFixture", { analysisId, deterministic: !real });
  stage = "access";
  const credentials = { analysisId, accessToken };
  const other = { analysisId, accessToken: randomBytes(32).toString("hex") };
  assert.equal(await client.query(api.analyses.getStatus, other), null);
  assert.equal(await client.query(api.analyses.getResults, other), null);
  await assert.rejects(
    client.action(api.files.requestUpload, {
      ...credentials,
      clientFileId: randomUUID(),
      name: "too-large.pdf",
      bytes: 10 * 1024 * 1024 + 1,
    }),
  );
  stage = "damaged-pdf";
  const broken = Buffer.from("%PDF-1.7\nThis is not a PDF document.");
  const invalid = await client.action(api.files.requestUpload, {
    ...credentials,
    clientFileId: randomUUID(),
    name: "damaged.pdf",
    bytes: broken.length,
  });
  assert(
    (
      await fetch(invalid.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: broken,
      })
    ).ok,
  );
  await client.mutation(api.files.completeUpload, {
    ...credentials,
    fileId: invalid.fileId,
  });
  const invalidStatus = await waitUntil(
    () => client.query(api.analyses.getStatus, credentials),
    (value) => value?.files[0]?.status === "invalid",
    40,
  );
  assert.equal(invalidStatus?.files[0]?.safeError, "invalid_pdf");
  await client.mutation(api.files.remove, {
    ...credentials,
    fileId: invalid.fileId,
  });
  stage = "encrypted-pdf";
  const temporary = mkdtempSync(join(tmpdir(), "krito-encrypted-fixture-"));
  let encrypted: Buffer;
  try {
    writeFileSync(
      join(temporary, "plain.pdf"),
      await pdf(["Krito encrypted development fixture"]),
    );
    execFileSync(
      "qpdf",
      [
        "--encrypt",
        "fixture-password",
        "fixture-owner",
        "256",
        "--",
        join(temporary, "plain.pdf"),
        join(temporary, "encrypted.pdf"),
      ],
      { stdio: "pipe" },
    );
    encrypted = readFileSync(join(temporary, "encrypted.pdf"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  const protectedUpload = await client.action(api.files.requestUpload, {
    ...credentials,
    clientFileId: randomUUID(),
    name: "password-protected.pdf",
    bytes: encrypted.length,
  });
  assert(
    (
      await fetch(protectedUpload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: new Uint8Array(encrypted),
      })
    ).ok,
  );
  await client.mutation(api.files.completeUpload, {
    ...credentials,
    fileId: protectedUpload.fileId,
  });
  const encryptedStatus = await waitUntil(
    () => client.query(api.analyses.getStatus, credentials),
    (value) => value?.files[0]?.status === "invalid",
    40,
  );
  assert.equal(encryptedStatus?.files[0]?.safeError, "encrypted_pdf");
  await client.mutation(api.files.remove, {
    ...credentials,
    fileId: protectedUpload.fileId,
  });
  stage = "maximum-files";
  const limitsId = await client.mutation(api.analyses.createDraft, {
    capabilityHash,
    catalogVersion: catalog.version,
    goalSetKey: topic.key,
  });
  fixtureIds.push(limitsId);
  internalCall("testHarness:markFixture", {
    analysisId: limitsId,
    deterministic: true,
  });
  const limitCredentials = { analysisId: limitsId, accessToken };
  for (let index = 0; index < 20; index++)
    await client.action(api.files.requestUpload, {
      ...limitCredentials,
      clientFileId: randomUUID(),
      name: `limit-${index}.pdf`,
      bytes: 1,
    });
  await assert.rejects(
    client.action(api.files.requestUpload, {
      ...limitCredentials,
      clientFileId: randomUUID(),
      name: "twenty-first.pdf",
      bytes: 1,
    }),
  );
  assert.equal(
    (await client.query(api.analyses.getStatus, limitCredentials))?.files
      .length,
    20,
  );
  stage = "valid-pdfs";
  const originals: { fileId: Id<"files">; bytes: Buffer; url: string }[] = [];
  const pdfs = [
    await pdf([
      "Krito testmateriaal",
      "Les over breuken voor het derde leerjaar.",
      "Verdeel een taart in vier gelijke delen. Elk deel is een vierde (1/4).",
      "Kleur drie van de vier delen. Dat is drie vierde (3/4).",
      "Lees de breuk: drie vierde. Schrijf de breuk 3/4.",
      "Teken een breuk als een deel van een geheel.",
    ]),
    await pdf([
      "Krito testmateriaal",
      "Aanvullende oefeningen over breuken.",
      "Verdeel twaalf blokjes in vier gelijke groepen van drie blokjes.",
      "Drie blokjes zijn een vierde van twaalf blokjes.",
      "Een half is evenveel als twee vierden. Vergelijk: 1/4 < 1/2.",
      "Maak een eigen tekening bij de breuken 1/2 en 3/4.",
    ]),
  ];
  for (const [index, bytes] of pdfs.entries()) {
    const upload = await client.action(api.files.requestUpload, {
      ...credentials,
      clientFileId: randomUUID(),
      name: `krito-fixture-${index + 1}.pdf`,
      bytes: bytes.length,
    });
    assert(
      new URL(upload.uploadUrl).searchParams
        .get("X-Amz-SignedHeaders")
        ?.includes("content-type"),
    );
    assert(
      (
        await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: bytes,
        })
      ).ok,
    );
    await client.mutation(api.files.completeUpload, {
      ...credentials,
      fileId: upload.fileId,
    });
    originals.push({ fileId: upload.fileId, bytes, url: upload.uploadUrl });
  }
  await waitUntil(
    () => client.query(api.analyses.getStatus, credentials),
    (value) =>
      value?.files.length === 2 &&
      value.files.every((f) => f.status === "ready"),
    60,
  );
  stage = "pre-submit";
  const before = internalCall<{ runs: unknown[] }>("testHarness:audit", {
    analysisId,
  });
  assert.equal(before.runs.length, 0);
  await assert.rejects(
    client.mutation(api.analyses.submit, { ...credentials, email: "invalid" }),
  );
  assert.equal(
    (await client.query(api.analyses.getStatus, credentials))?.status,
    "draft",
  );
  stage = "submit";
  const ids = await Promise.all([
    client.mutation(api.analyses.submit, {
      ...credentials,
      email: " dev.fixture+all.goals@example.com ",
    }),
    client.mutation(api.analyses.submit, {
      ...credentials,
      email: "dev.fixture+all.goals@example.com",
    }),
  ]);
  assert.deepEqual(ids, [analysisId, analysisId]);
  await waitUntil(
    () => client.query(api.analyses.getStatus, credentials),
    (value) =>
      value !== null &&
      ["checking", "rechecking", "completed", "failed"].includes(value.status),
    60,
  );
  // A previously issued PUT can modify only staging, while citations read the sealed original.
  stage = "seal-check";
  const changed = await pdf([
    "A different replacement PDF, which must not affect the submitted material.",
  ]);
  assert(
    (
      await fetch(originals[0].url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: changed,
      })
    ).ok,
  );
  stage = "completion";
  const finalStatus = await waitUntil(
    () => client.query(api.analyses.getStatus, credentials),
    (value) => value?.status === "completed" || value?.status === "failed",
    real ? 1200 : 240,
  );
  if (finalStatus?.status !== "completed")
    throw new Error(
      `Workflow ended with safe error ${finalStatus?.safeError ?? "unknown"}`,
    );
  stage = "results";
  const results = await client.query(api.analyses.getResults, credentials);
  assert(results);
  assert.equal(results.goals.length, topic.goalCount);
  const publicJson = JSON.stringify(results);
  for (const secretField of [
    "email",
    "capabilityHash",
    "stagingKey",
    "sealedKey",
    "responseId",
    "uploadUrl",
  ])
    assert(!publicJson.includes(`"${secretField}"`));
  assert(!publicJson.includes("dev.fixture+all.goals@example.com"));
  const source = await client.query(api.goals.listGoals, {
    catalogVersion: topic.catalogVersion,
    goalSetKey: topic.key,
  });
  assert.deepEqual(
    results.goals.map((g) => g.snapshot.goalId),
    source.goals.map((g) => g.goalId),
  );
  assert.deepEqual(
    results.goals.map((g) => g.snapshot.wording),
    source.goals.map((g) => g.wording),
  );
  await assert.rejects(
    client.action(api.files.getViewUrl, {
      ...other,
      fileId: originals[0].fileId,
      page: 1,
    }),
  );
  const view = await client.action(api.files.getViewUrl, {
    ...credentials,
    fileId: originals[0].fileId,
    page: 1,
  });
  const downloaded = Buffer.from(await (await fetch(view)).arrayBuffer());
  assert.equal(
    createHash("sha256").update(downloaded).digest("hex"),
    createHash("sha256").update(originals[0].bytes).digest("hex"),
  );
  const unsigned = new URL(view);
  unsigned.search = "";
  unsigned.hash = "";
  assert(!(await fetch(unsigned)).ok);
  stage = "audit";
  const audit = internalCall<{
    runs: {
      stage: string;
      retryCount: number;
      requestShape: {
        model: string;
        goalIds: string[];
        fileIds: string[];
        detail: string;
      };
      status: string;
    }[];
    goals: {
      lunaResult: { confidence: number };
      finalResult: { confidence: number };
      needsReview: boolean;
      modelUsed: string;
      reviewReason: string | null;
    }[];
    recheckTotal: number;
    recheckCompleted: number;
    profile: {
      linked: boolean;
      emailVerified: boolean;
      legacyEmailPresent: boolean;
      hasPlusTag: boolean;
    };
  }>("testHarness:audit", { analysisId });
  assert(audit.profile.linked);
  assert.equal(audit.profile.emailVerified, false);
  assert.equal(audit.profile.legacyEmailPresent, false);
  assert(audit.profile.hasPlusTag);
  const initial = audit.runs.filter((r) => r.stage === "initial");
  assert.equal(initial.length, 1);
  assert.equal(initial[0].retryCount, 0);
  assert.equal(initial[0].requestShape.goalIds.length, 11);
  for (const r of audit.runs) {
    assert.equal(r.requestShape.detail, "auto");
    assert.deepEqual(
      new Set(r.requestShape.fileIds),
      new Set(originals.map((f) => f.fileId)),
    );
    if (r.stage === "recheck") assert.equal(r.requestShape.goalIds.length, 1);
  }
  if (!real) {
    assert.equal(audit.recheckTotal, 2);
    assert.equal(audit.recheckCompleted, 2);
    assert.equal(audit.runs.filter((r) => r.stage === "recheck").length, 2);
    assert.equal(audit.goals[1].lunaResult.confidence, 59);
    assert.equal(audit.goals[1].finalResult.confidence, 70);
    assert.equal(audit.goals[1].modelUsed, "gpt-6.1-sol");
    assert.equal(audit.goals[2].finalResult.confidence, 60);
    assert.equal(audit.goals[2].modelUsed, "gpt-6-luna");
    assert.equal(audit.goals[3].finalResult.confidence, 35);
    assert.equal(audit.goals[3].reviewReason, "recheck_failed");
    assert(audit.goals[3].needsReview);
    assert.equal(
      audit.runs.find((r) => r.stage === "recheck" && r.status === "failed")
        ?.retryCount,
      2,
    );
  }
  console.log(
    `${real ? "Real provider" : "Deterministic"} workflow passed: ${results.goals.length} complete goal snapshots, two sealed PDFs, private access, duplicate prevention, ${audit.recheckTotal} independent rechecks.`,
  );
  if (real) {
    const evidence = results.goals.flatMap((g) => g.result.evidence);
    for (const e of evidence.filter((e) => e.kind === "text").slice(0, 4))
      assert(
        e.page === 1 &&
          pdfs.some((_, index) => originals[index].fileId === e.fileId),
      );
    console.log(
      "Representative evidence (non-sensitive fixture only):",
      JSON.stringify(
        evidence.slice(0, 3).map((e) => ({
          page: e.page,
          kind: e.kind,
          quote: e.quote,
          description: e.description,
        })),
      ),
    );
  }
}
try {
  await run();
} catch (error) {
  if (error instanceof AssertionError)
    console.error(
      `Assertion ${error.operator}; actual=${typeof error.actual === "string" && /^[a-z_]+$/.test(error.actual) ? error.actual : typeof error.actual}`,
    );
  console.error(
    `Development workflow smoke failed at ${stage} (${error instanceof Error ? error.name : "unknown"}); private details withheld.`,
  );
  process.exitCode = 1;
} finally {
  for (const analysisId of fixtureIds) {
    try {
      internalCall("testHarness:cleanup", { analysisId });
    } catch {
      console.warn("Development fixture cleanup needs retry.");
    }
  }
}
