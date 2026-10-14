import { readFileSync, statSync } from "node:fs";
import { assertDevelopment, assertProduction, cli, development, production, readEnv, vercelApi } from "./lib";

// Local development and every Preview use the development backend. Only
// Vercel Production builds against production, and only it gets the
// production deploy key (scripts/buildVercel.ts publishes the backend with it).
assertDevelopment();
assertProduction();
const keyFile = ".secrets/convex-production.env";
if ((statSync(keyFile).mode & 0o077) !== 0) throw new Error("Deploy key file must have owner-only permissions (chmod 600).");
const deployKey = readEnv(keyFile).CONVEX_DEPLOY_KEY?.trim();
if (!deployKey?.startsWith(`${production.convexDeployment}|`)) {
  throw new Error(`${keyFile} must hold a deploy key for ${production.convexDeployment}.`);
}

const { projectId } = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectId: string };
type Env = { id: string; key: string; value?: string; type: string; target: string[]; gitBranch?: string | null };
const endpoint = `/v9/projects/${projectId}/env`;
const list = () => vercelApi<{ envs: Env[] }>(endpoint).envs;
const forbidden = ["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_LINK_SECRET"];
const managed = ["NEXT_PUBLIC_CONVEX_URL", "KRITO_BACKEND_ENV", "CONVEX_DEPLOY_KEY"];
const existing = list();
if (existing.some((entry) => forbidden.includes(entry.key))) {
  throw new Error("Backend credentials are present on Vercel; remove them before proceeding.");
}
if (existing.some((entry) => managed.includes(entry.key) && entry.gitBranch)) {
  throw new Error("Branch-scoped backend variables conflict with the shared preview environment.");
}

// Narrow the existing entries in place (no moment without a variable), then add
// the production ones.
const shared = ["development", "preview"];
const payload = [
  { key: "NEXT_PUBLIC_CONVEX_URL", value: development.convexUrl, type: "plain", target: shared },
  { key: "KRITO_BACKEND_ENV", value: "development", type: "plain", target: shared },
  { key: "NEXT_PUBLIC_CONVEX_URL", value: production.convexUrl, type: "plain", target: ["production"] },
  { key: "KRITO_BACKEND_ENV", value: "production", type: "plain", target: ["production"] },
  { key: "CONVEX_DEPLOY_KEY", value: deployKey, type: "sensitive", target: ["production"] },
];
const write = (path: string, method: string, body: unknown) =>
  cli("npx", ["vercel", "api", path, "--method", method, "--input", "-", "--scope", development.vercelScope], JSON.stringify(body));
for (const entry of payload) {
  const isProduction = entry.target.includes("production");
  const current = existing.filter((e) => e.key === entry.key && e.target.some((t) => entry.target.includes(t)));
  if (entry.key === "CONVEX_DEPLOY_KEY" && existing.some((e) => e.key === entry.key && e.target.some((t) => t !== "production"))) {
    throw new Error("CONVEX_DEPLOY_KEY must only exist on Production.");
  }
  if (!current.length) write(`/v10/projects/${projectId}/env`, "POST", entry);
  for (const e of current) {
    // An entry spanning both backends keeps only this entry's targets.
    const target = isProduction ? ["production"] : e.target.filter((t) => entry.target.includes(t));
    if (isProduction && e.target.length > 1) throw new Error(`Run the development entries first: ${entry.key} still spans Production.`);
    write(`${endpoint}/${e.id}`, "PATCH", { value: entry.value, type: entry.type, target });
  }
  existing.splice(0, existing.length, ...list());
}

const configured = list();
for (const { key, value, type, target } of payload) {
  for (const environment of target) {
    const matches = configured.filter((entry) => entry.key === key && entry.target.includes(environment) && !entry.gitBranch);
    if (matches.length !== 1) throw new Error(`Expected exactly one ${key} in ${environment}.`);
    // Sensitive values can't be read back; plain ones must match.
    if (type === "plain" && matches[0].value !== value) throw new Error(`Configured ${key} does not match ${environment}.`);
  }
}
console.log("Development and Preview build against development; Production against production with its own deploy key (value withheld).");
