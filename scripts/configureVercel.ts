import { readFileSync } from "node:fs";
import { assertDevelopment, cli, development, vercelApi } from "./lib";

assertDevelopment();
const link = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectId: string; orgId: string };
type Project = {
  id: string; accountId: string; name: string;
  framework: string; installCommand: string; buildCommand: string; nodeVersion: string;
  rootDirectory: string | null; previewDeploymentsDisabled?: boolean;
  ssoProtection: { deploymentType: string } | null;
  link?: { type: string; org: string; repo: string; productionBranch: string };
};
const endpoint = `/v9/projects/${link.projectId}`;
let project = vercelApi<Project>(endpoint);
if (project.name !== development.vercelProject || project.accountId !== link.orgId) {
  throw new Error("Linked Vercel project does not match the selected personal project.");
}

const desired = {
  framework: "nextjs", rootDirectory: null, installCommand: "npm ci",
  buildCommand: "npx tsx scripts/buildVercel.ts", nodeVersion: "24.x",
  previewDeploymentsDisabled: false, gitForkProtection: true,
  ssoProtection: { deploymentType: "all" },
};
// Fields verified against Vercel's official updateProject OpenAPI schema.
cli("npx", ["vercel", "api", endpoint, "--method", "PATCH", "--input", "-", "--scope", development.vercelScope], JSON.stringify(desired));
project = vercelApi<Project>(endpoint);
for (const key of ["framework", "rootDirectory", "installCommand", "buildCommand", "nodeVersion", "previewDeploymentsDisabled"] as const) {
  if (project[key] !== desired[key]) throw new Error(`Vercel setting mismatch: ${key}.`);
}
if (project.ssoProtection?.deploymentType !== "all") throw new Error("All frontend deployments must remain protected during development.");
if (project.link && (project.link.type !== "github" || `${project.link.org}/${project.link.repo}` !== development.githubRepository || project.link.productionBranch !== "main")) {
  throw new Error("Vercel Git integration must use the selected repository and main branch.");
}
console.log("Verified Vercel framework, root, commands, runtime, previews, and all-deployment protection.");
console.log(project.link ? "Verified Git repository and main production branch." : "Git not connected yet; connect with vercel git connect, then rerun this check.");
