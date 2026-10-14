import { statSync } from "node:fs";
import { cli, development, readEnv, selectTarget } from "./lib";
import { PRIMARY_MODEL, RECHECK_MODEL } from "../shared/analysisSchema";

// Development by default; `-- --production` installs the launched backend.
const target = selectTarget();
const file = target.secretsFile;
if ((statSync(file).mode & 0o077) !== 0) throw new Error("Credential file must have owner-only permissions (chmod 600).");
const values = readEnv(file);
const required = ["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const email = ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_LINK_SECRET"];
// Production starts empty, so it needs every secret; development may already have the e-mail ones.
if (target.appEnv === "production") required.push(...email);
for (const name of required) {
  if (!values[name]?.trim()) throw new Error(`${name} is missing from the protected file.`);
}
const optional = email.filter((name) => !required.includes(name) && values[name]?.trim());
const payload: Record<string, string> = {
  APP_ENV: target.appEnv,
  R2_ACCOUNT_ID: development.cloudflareAccountId,
  R2_BUCKET_NAME: target.r2Bucket,
  EMAIL_FROM: "Anton van Krito <anton@mail.krito.be>",
  EMAIL_REPLY_TO: "anton.verhasselt@gmail.com",
  SITE_URL: "https://www.krito.be",
  ...Object.fromEntries([...required, ...optional].map((name) => [name, values[name]])),
};
if (target.appEnv === "production") {
  // Development keeps its own models (npm run ai:smoke), PostHog (npm run env:posthog)
  // and e-mail mode; production gets them here.
  const token = readEnv().NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) throw new Error("Set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN in .env.local first.");
  Object.assign(payload, {
    AI_PRIMARY_MODEL: PRIMARY_MODEL,
    AI_RECHECK_MODEL: RECHECK_MODEL,
    POSTHOG_PROJECT_TOKEN: token,
    POSTHOG_HOST: "https://eu.i.posthog.com",
    EMAIL_MODE: "live",
  });
}
cli("npx", ["convex", "env", "set", "--force", "--deployment", target.deployment],
  Object.entries(payload).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n"));
console.log(`${target.appEnv === "production" ? "Production" : "Development"} backend variables updated; values withheld.`);
