import { readFileSync } from "node:fs";
import { assertDevelopment, cli, development, vercelApi } from "./lib";

assertDevelopment();
const { projectId } = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectId: string };
type Env = { key: string; target: string[]; gitBranch?: string | null };
const existing = vercelApi<{ envs: Env[] }>(`/v9/projects/${projectId}/env`).envs;
const forbidden = ["CONVEX_DEPLOY_KEY", "OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
if (existing.some((entry) => forbidden.includes(entry.key))) {
  throw new Error("Backend credentials are present on Vercel; remove them before proceeding.");
}
for (const key of ["NEXT_PUBLIC_CONVEX_URL", "KRITO_BACKEND_ENV"]) {
  if (existing.some((entry) => entry.key === key && entry.gitBranch)) {
    throw new Error("Branch-scoped frontend variables conflict with the shared development environment.");
  }
}
const payload = [
  { key: "NEXT_PUBLIC_CONVEX_URL", value: development.convexUrl },
  { key: "KRITO_BACKEND_ENV", value: "development" },
].map((entry) => ({ ...entry, type: "plain", target: ["development", "preview", "production"] }));
for (const entry of payload) {
  cli("npx", ["vercel", "api", `/v10/projects/${projectId}/env?upsert=true`, "--method", "POST", "--input", "-", "--scope", development.vercelScope], JSON.stringify(entry));
}
const configured = vercelApi<{ envs: Env[] }>(`/v9/projects/${projectId}/env`).envs;
for (const key of ["NEXT_PUBLIC_CONVEX_URL", "KRITO_BACKEND_ENV"]) {
  for (const target of ["development", "preview", "production"]) {
    if (!configured.some((entry) => entry.key === key && entry.target.includes(target) && !entry.gitBranch)) {
      throw new Error(`Missing generic ${key} in ${target}.`);
    }
  }
}
console.log("Both frontend variables configured on Development, all Previews, and Production; no branch overrides or backend secrets.");
