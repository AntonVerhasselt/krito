import { statSync } from "node:fs";
import { assertDevelopment, cli, development, readEnv } from "./lib";

assertDevelopment();
const file = ".secrets/development.env";
if ((statSync(file).mode & 0o077) !== 0) throw new Error("Credential file must have owner-only permissions (chmod 600).");
const values = readEnv(file);
const required = ["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
for (const name of required) {
  if (!values[name]?.trim()) throw new Error(`${name} is missing from the protected file.`);
}
// E-mail secrets are optional here: they may already be set on the deployment.
const optional = ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_LINK_SECRET"].filter((name) => values[name]?.trim());
const payload = {
  APP_ENV: "development",
  R2_ACCOUNT_ID: development.cloudflareAccountId,
  R2_BUCKET_NAME: development.r2Bucket,
  EMAIL_FROM: "Anton van Krito <anton@mail.krito.be>",
  EMAIL_REPLY_TO: "anton.verhasselt@gmail.com",
  SITE_URL: "https://www.krito.be",
  ...Object.fromEntries([...required, ...optional].map((name) => [name, values[name]])),
};
cli("npx", ["convex", "env", "set", "--force", "--deployment", development.convexDeployment.slice(4)],
  Object.entries(payload).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n"));
console.log("Development backend variables updated; values withheld.");
