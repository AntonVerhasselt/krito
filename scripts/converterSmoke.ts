import assert, { AssertionError } from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { convertToPdf, converterConfig } from "../convex/node/convert";
import { assertDevelopment, cli, development } from "./lib";
import { VALIDATION_TIMEOUT_MS } from "../shared/analysisSchema";
import { checkConvertedPdf, converterFixtures } from "../tests/helpers/converterFixtures";

// An explicitly run test of the existing development service, not a deployment.
// Only its own marked fixture is mutated; AI output is deterministic.
const client = new ConvexHttpClient(development.convexUrl);
let stage = "development configuration";
let analysisId: Id<"analyses"> | undefined;
let marked = false;

function internalCall(name: string, args: unknown) {
  return cli("npx", ["convex", "run", name, JSON.stringify(args),
    "--deployment", development.convexDeployment.slice(4)]);
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, seconds: number): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error("Test timed out");
}

async function run() {
  assertDevelopment();
  // Fail early if text extraction is unavailable, before creating test data.
  execFileSync("pdftotext", ["-v"], { stdio: "pipe" });
  const output = cli("npx", ["convex", "env", "list", "--deployment", development.convexDeployment.slice(4)]);
  const variables = Object.fromEntries(output.split("\n").filter((line) => line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
  assert(variables.APP_ENV === "development", "Live converter test requires APP_ENV=development");
  const config = converterConfig(variables);
  assert(new URL(config.url).protocol === "https:", "Deployed converter must use HTTPS");
  const fixtures = converterFixtures();

  stage = "converter authentication";
  for (const [label, password] of [["missing", null], ["incorrect", `${config.password}-invalid`]] as const) {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(fixtures[0].bytes)], { type: fixtures[0].type.contentType }), "source.docx");
    const response = await fetch(`${config.url}/forms/libreoffice/convert`, {
      method: "POST", body: form, redirect: "error",
      headers: password === null ? {} : {
        Authorization: `Basic ${Buffer.from(`${config.username}:${password}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(110_000),
    });
    await response.body?.cancel();
    assert.equal(response.status, 401, `${label} credentials must be rejected`);
    console.log(`PASS ${label} converter credentials rejected`);
  }
  for (const fixture of fixtures) {
    stage = `authenticated conversion of ${fixture.name}`;
    const pdf = await convertToPdf(fixture.bytes, fixture.type, config);
    await checkConvertedPdf(pdf, fixture);
    console.log(`PASS ${fixture.name}: authenticated PDF, ${fixture.pages} page(s)${fixture.text.length ? ", expected text" : ""}`);
  }
  stage = "damaged source rejection";
  await assert.rejects(convertToPdf(fixtures[0].bytes.subarray(0, 64), fixtures[0].type, config),
    // LibreOffice can report malformed archives as a conversion error or an
    // unavailable worker. Neither outcome may be accepted as a usable PDF.
    (error: unknown) => error instanceof Error && ["conversion_failed", "conversion_unavailable"].includes(error.message));
  console.log("PASS damaged Office source rejected");

  stage = "fixture draft";
  const catalog = await client.query(api.goals.catalogInfo, {});
  assert(catalog, "Published development catalog is required");
  const search = await client.query(api.goals.listGoalSets, {
    search: "breuken 3de leerjaar", catalogVersion: catalog.version,
  });
  const topic = search.topics[0];
  assert(topic, "Expected development topic is missing");
  const accessToken = randomBytes(32).toString("hex");
  analysisId = await client.mutation(api.analyses.createDraft, {
    capabilityHash: createHash("sha256").update(accessToken).digest("hex"),
    catalogVersion: catalog.version, goalSetKey: topic.key,
  });
  internalCall("testHarness:markFixture", { analysisId, deterministic: true });
  marked = true;
  const credentials = { analysisId, accessToken };
  const wrong = { analysisId, accessToken: randomBytes(32).toString("hex") };
  const uploaded: { fileId: Id<"files">; fixture: typeof fixtures[number] }[] = [];

  for (const fixture of fixtures) {
    stage = `private upload of ${fixture.name}`;
    const upload = await client.action(api.files.requestUpload, {
      ...credentials, clientFileId: randomUUID(), name: fixture.name, bytes: fixture.bytes.length,
    });
    const response = await fetch(upload.uploadUrl, {
      method: "PUT", headers: { "Content-Type": upload.contentType },
      body: new Uint8Array(fixture.bytes), signal: AbortSignal.timeout(30_000),
    });
    assert(response.ok, "Private fixture source upload failed");
    await response.body?.cancel();
    await client.mutation(api.files.completeUpload, { ...credentials, fileId: upload.fileId });
    const status = await waitFor(
      () => client.query(api.analyses.getStatus, credentials),
      (status) => status?.files.some((file) => file.fileId === upload.fileId && ["ready", "invalid"].includes(file.status)) ?? false,
      VALIDATION_TIMEOUT_MS / 1000,
    );
    const file = status?.files.find((file) => file.fileId === upload.fileId);
    assert.equal(file?.status, "ready", `${fixture.name}: upload did not become ready (safe error: ${file?.safeError ?? "none"})`);
    // Conversion waits for the analysis, so only PDFs have a page count now.
    assert.equal(file.pageCount, fixture.type.kind === "pdf" ? fixture.pages : null, `${fixture.name}: unexpected page count before the analysis`);
    uploaded.push({ fileId: upload.fileId, fixture });
    // Draft sources must not be exposed as analysis documents before sealing.
    await assert.rejects(client.action(api.files.getViewUrl, { ...credentials, fileId: upload.fileId, page: 1 }));
    console.log(`PASS ${fixture.name}: uploaded and stored unconverted; draft source remains unavailable`);
  }

  stage = "analysis and file sealing";
  await client.mutation(api.analyses.submit, { ...credentials, email: "converter.fixture+regression@example.com" });
  const status = await waitFor(
    () => client.query(api.analyses.getStatus, credentials),
    (status) => status !== null && ["completed", "failed"].includes(status.status),
    240,
  );
  assert.equal(status?.status, "completed", `Converted-file analysis did not complete (safe error: ${status?.safeError ?? "none"})`);
  const results = await client.query(api.analyses.getResults, credentials);
  assert(results, "Converted-file analysis results are missing");
  assert.equal(results.goals.length, topic.goalCount, "Analysis lost selected goals");
  assert.equal(results.files.length, fixtures.length, "Analysis lost converted files");
  assert.deepEqual(results.skippedFiles, [], "Analysis left out a readable file");
  for (const { fileId, fixture } of uploaded)
    assert.equal(results.files.find((f) => f.fileId === fileId)?.pageCount, fixture.pages, `${fixture.name}: analysis recorded the wrong page count`);
  const pageCounts = new Map(uploaded.map(({ fileId, fixture }) => [String(fileId), fixture.pages]));
  for (const goal of results.goals) {
    assert(goal.result, "Analysis goal has no result");
    for (const evidence of goal.result.evidence) {
      assert(pageCounts.has(evidence.fileId), "Citation points to an unknown converted file");
      assert(Number.isInteger(evidence.page) && evidence.page >= 1 && evidence.page <= pageCounts.get(evidence.fileId)!, "Citation page is outside its converted PDF");
    }
  }
  assert(results.goals.some((goal) => goal.result?.evidence.length), "Fixture analysis has no citations to verify");
  assert((await client.query(api.analyses.getResults, wrong)) === null, "Wrong capability could read results");
  console.log("PASS deterministic analysis retains all files, goals and valid citation pages; wrong capability denied");

  for (const { fileId, fixture } of uploaded) {
    stage = `private sealed PDF and page link for ${fixture.name}`;
    await assert.rejects(client.action(api.files.getViewUrl, { ...wrong, fileId, page: 1 }));
    await assert.rejects(client.action(api.files.getViewUrl, { ...credentials, fileId, page: fixture.pages + 1 }));
    const view = await client.action(api.files.getViewUrl, { ...credentials, fileId, page: fixture.pages });
    assert(new URL(view).hash === `#page=${fixture.pages}`, "Source link targets the wrong PDF page");
    const response = await fetch(view, { signal: AbortSignal.timeout(30_000) });
    assert(response.ok, "Authorized sealed PDF download failed");
    await checkConvertedPdf(new Uint8Array(await response.arrayBuffer()), fixture);
    const unsigned = new URL(view);
    unsigned.search = "";
    unsigned.hash = "";
    const denied = await fetch(unsigned, { signal: AbortSignal.timeout(30_000) });
    assert(!denied.ok, "Unsigned access to a private converted PDF was allowed");
    await denied.body?.cancel();
    console.log(`PASS ${fixture.name}: sealed PDF text/page count and page link; unauthorized access denied`);
  }
}

try {
  await run();
} catch (error) {
  // Never print a provider response, signed URL, password or capability.
  const detail = error instanceof AssertionError ? ` ${error.message}` : " Check local prerequisites and the development service.";
  console.error(`FAIL converter test at ${stage}.${detail}`);
  process.exitCode = 1;
} finally {
  if (analysisId && marked) {
    try {
      internalCall("testHarness:cleanup", { analysisId });
      console.log("Test fixture cleanup scheduled.");
    } catch {
      console.error("FAIL development fixture cleanup; provider output withheld.");
      process.exitCode = 1;
    }
  }
}
