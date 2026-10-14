import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { assertDevelopment, assertProduction, cli, development, production, vercelApi } from "./lib";

// Production serves only the public domains: apply its checked-in rule as-is.
if (process.argv.includes("--production")) {
  assertProduction();
  const file = "infra/r2-cors.prod.json";
  const origins = JSON.parse(readFileSync(file, "utf8")).rules?.[0]?.allowed?.origins as string[];
  if (JSON.stringify([...origins].sort()) !== JSON.stringify([...production.publicOrigins].sort()))
    throw new Error("Production CORS origins must equal publicOrigins in infra/production.json.");
  cli("npx", ["wrangler", "r2", "bucket", "cors", "set", production.r2Bucket, "--file", file, "--force"]);
  console.log(`Applied ${origins.length} public origins to ${production.r2Bucket}.`);
  process.exit(0);
}
assertDevelopment();
type Deployment = { uid: string; url: string; readyState: string };
type Detail = {
  projectId: string;
  url: string;
  alias: string[];
  readyState: string;
};
type Project = { id: string; name: string; accountId: string };
const project = vercelApi<Project>(`/v9/projects/${development.vercelProject}`);
if (project.name !== development.vercelProject)
  throw new Error("Unexpected Vercel project.");
const publicOrigins = new Set(development.publicOrigins);
const origins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...publicOrigins,
]);
let until: number | undefined;
do {
  const page = vercelApi<{
    deployments: Deployment[];
    pagination?: { next: number | null };
  }>(
    `/v6/deployments?projectId=${project.id}&limit=100${until ? `&until=${until}` : ""}`,
  );
  for (const deployment of page.deployments) {
    if (deployment.readyState !== "READY") continue;
    const detail = vercelApi<Detail>(`/v13/deployments/${deployment.uid}`);
    if (detail.projectId !== project.id)
      throw new Error("Deployment belongs to a different project.");
    for (const hostname of [detail.url, ...(detail.alias ?? [])]) {
      const origin = new URL(`https://${hostname}`).origin;
      // Browsers PUT uploads straight to R2, so every domain that serves
      // the app must be listed; unknown custom domains are a setup error.
      if (!origin.endsWith(".vercel.app") && !publicOrigins.has(origin))
        throw new Error(
          `Add ${origin} to publicOrigins in infra/development.json.`,
        );
      origins.add(origin);
    }
  }
  until = page.pagination?.next ?? undefined;
} while (until);

const configured = JSON.parse(readFileSync("infra/r2-cors.dev.json", "utf8"));
if (configured.rules?.length !== 1)
  throw new Error("Expected one checked-in development CORS rule.");
const rule = configured.rules[0];
const policy = {
  rules: [
    { ...rule, allowed: { ...rule.allowed, origins: [...origins].sort() } },
  ],
};
const applyOnly = process.argv.includes("--apply-only");
if (applyOnly) mkdirSync(".secrets", { recursive: true, mode: 0o700 });
const policyFile = applyOnly
  ? ".secrets/r2-cors.dev.generated.json"
  : "infra/r2-cors.dev.json";
writeFileSync(policyFile, JSON.stringify(policy, null, 2) + "\n", {
  mode: applyOnly ? 0o600 : 0o644,
});
cli("npx", [
  "wrangler",
  "r2",
  "bucket",
  "cors",
  "set",
  development.r2Bucket,
  "--file",
  policyFile,
  "--force",
]);
console.log(
  `Reconciled ${origins.size} exact authorized development origins; no wildcard tenants.`,
);
