import { writeFileSync } from "node:fs";
import { assertDevelopment, cli, development, vercelApi } from "./lib";

assertDevelopment();
type Deployment = { uid: string; url: string; readyState: string };
type Detail = { projectId: string; url: string; alias: string[]; readyState: string };
type Project = { id: string; name: string; accountId: string };
const project = vercelApi<Project>(`/v9/projects/${development.vercelProject}`);
if (project.name !== development.vercelProject) throw new Error("Unexpected Vercel project.");
const origins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
let until: number | undefined;
do {
  const page = vercelApi<{ deployments: Deployment[]; pagination?: { next: number | null } }>(
    `/v6/deployments?projectId=${project.id}&limit=100${until ? `&until=${until}` : ""}`,
  );
  for (const deployment of page.deployments) {
    if (deployment.readyState !== "READY") continue;
    const detail = vercelApi<Detail>(`/v13/deployments/${deployment.uid}`);
    if (detail.projectId !== project.id) throw new Error("Deployment belongs to a different project.");
    for (const hostname of [detail.url, ...(detail.alias ?? [])]) {
      const origin = new URL(`https://${hostname}`).origin;
      if (!origin.endsWith(".vercel.app")) throw new Error("Public launch domains are not configured during setup.");
      origins.add(origin);
    }
  }
  until = page.pagination?.next ?? undefined;
} while (until);

const policy = { rules: [{
  allowed: { origins: [...origins].sort(), methods: ["PUT", "GET", "HEAD"],
    headers: ["Content-Type", "x-amz-checksum-crc32", "x-amz-sdk-checksum-algorithm"] },
  exposeHeaders: ["ETag"], maxAgeSeconds: 3600,
}] };
writeFileSync("infra/r2-cors.dev.json", JSON.stringify(policy, null, 2) + "\n");
cli("npx", ["wrangler", "r2", "bucket", "cors", "set", development.r2Bucket, "--file", "infra/r2-cors.dev.json", "--force"]);
console.log(`Reconciled ${origins.size} exact authorized development origins; no wildcard tenants.`);
