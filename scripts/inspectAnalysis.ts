import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { assertDevelopment, cli, development } from "./lib";
import type { FunctionReturnType } from "convex/server";
import { internal } from "../convex/_generated/api";
assertDevelopment();
const analysisId = process.argv[2];
if (!analysisId) throw new Error("Pass the analysis ID");
const audit: FunctionReturnType<typeof internal.analysisAdmin.inspect> =
  JSON.parse(
    cli("npx", [
      "convex",
      "run",
      "analysisAdmin:inspect",
      JSON.stringify({ analysisId }),
      "--deployment",
      development.convexDeployment.slice(4),
    ]),
  );
if (!audit) throw new Error("Analysis unavailable");
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const downloads = execFileSync("xdg-user-dir", ["DOWNLOAD"], {
  encoding: "utf8",
}).trim();
const pages = new Map<string, string[]>();
let matchedFiles = 0;
for (const f of audit.files) {
  if (
    ![
      "krito-magnetisme-les-10jaar.pdf",
      "krito-magnetisme-oefeningen-10jaar.pdf",
    ].includes(f.name)
  )
    continue;
  const file = path.join(downloads, path.basename(f.name));
  if (
    createHash("sha256").update(readFileSync(file)).digest("hex") !== f.sha256
  )
    continue;
  pages.set(
    f.fileId,
    execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" })
      .split("\f")
      .map(normalize),
  );
  matchedFiles++;
}
const evidence = audit.goals.flatMap((g) => g.finalResult?.evidence ?? []),
  text = evidence.filter((e) => e.kind === "text"),
  checked = text.filter((e) => pages.has(e.fileId)),
  mismatches = checked.filter(
    (e) =>
      !pages.get(e.fileId)![e.page - 1]?.includes(normalize(e.quote ?? "")),
  );
const counts = { covered: 0, partial: 0, not_found: 0, uncertain: 0 };
for (const g of audit.goals) if (g.finalResult) counts[g.finalResult.status]++;
console.log(
  JSON.stringify(
    {
      status: audit.status,
      topic: audit.topic.title,
      group: audit.topic.group.title,
      goalCount: audit.goals.length,
      counts,
      elapsedSeconds:
        audit.completedAt && audit.submittedAt
          ? Math.round((audit.completedAt - audit.submittedAt) / 1000)
          : null,
      structurallyValid: audit.structurallyValid,
      sealedFiles: audit.files.filter((f) => f.sealed).length,
      localFilesHashMatched: matchedFiles,
      textQuotesChecked: checked.length,
      textQuotesMismatched: mismatches.length,
      recheckTotal: audit.recheckTotal,
      runs: audit.runs.map((r) => ({
        model: r.requestShape?.model,
        goals: r.requestShape?.goalIds.length,
        files: r.requestShape?.fileIds.length,
        status: r.status,
        retries: r.retryCount,
        pollFailures: r.pollFailures,
      })),
    },
    null,
    2,
  ),
);
if (mismatches.length) process.exitCode = 1;
