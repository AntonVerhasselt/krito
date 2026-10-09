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
const payload = {
  APP_ENV: "development",
  R2_ACCOUNT_ID: development.cloudflareAccountId,
  R2_BUCKET_NAME: development.r2Bucket,
  ...Object.fromEntries(required.map((name) => [name, values[name]])),
};
cli("npx", ["convex", "env", "set", "--force", "--deployment", development.convexDeployment.slice(4)],
  Object.entries(payload).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n"));
console.log("Development backend variables updated; values withheld.");
