import { assertDevelopment, cli, development } from "./lib";

assertDevelopment();
const output = cli("npx", ["convex", "env", "list", "--deployment", development.convexDeployment.slice(4)]);
const names = new Set(output.split("\n").map((line) => line.split("=")[0].trim()));
const required = ["APP_ENV", "OPENAI_API_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "AI_PRIMARY_MODEL", "AI_RECHECK_MODEL", "CONVERTER_URL", "CONVERTER_USERNAME", "CONVERTER_PASSWORD"];
for (const name of required) console.log(`${name}: ${names.has(name) ? "present" : "absent"}`);
if (required.some((name) => !names.has(name))) process.exitCode = 1;
