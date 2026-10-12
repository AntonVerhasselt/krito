import { assertDevelopment, cli, development, readEnv } from "./lib";

assertDevelopment();
const output = cli("npx", ["convex", "env", "list", "--deployment", development.convexDeployment.slice(4)]);
const names = new Set(output.split("\n").map((line) => line.split("=")[0].trim()));
const required = ["APP_ENV", "OPENAI_API_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "AI_PRIMARY_MODEL", "AI_RECHECK_MODEL", "CONVERTER_URL", "CONVERTER_USERNAME", "CONVERTER_PASSWORD", "POSTHOG_PROJECT_TOKEN", "POSTHOG_HOST"];
for (const name of required) console.log(`${name}: ${names.has(name) ? "present" : "absent"}`);
if (required.some((name) => !names.has(name))) process.exitCode = 1;

// Collection is opt-in; the installed component still needs its deployment settings.
const local = readEnv();
for (const name of ["POSTHOG_ENABLE_LOCAL"]) {
  console.log(`${name} (optional backend): ${names.has(name) ? "present" : "absent"}`);
}
for (const name of ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST"]) {
  console.log(`${name} (optional frontend): ${local[name]?.trim() ? "present" : "absent"}`);
}
console.log(`PostHog frontend integration: ${local.NEXT_PUBLIC_POSTHOG_ENABLED === "true" ? "enabled; opt-in required" : "disabled"}`);
