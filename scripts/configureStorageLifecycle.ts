import { readFileSync } from "node:fs";
import { cli, selectTarget } from "./lib";

// Development deletes leftover uploads after a day. Production keeps teachers'
// uploads and the analysed copies for a year, so they can be reused later;
// abandoned drafts and removed files are still deleted by the backend itself.
const target = selectTarget();
const file = target.appEnv === "production" ? "infra/r2-lifecycle.prod.json" : "infra/r2-lifecycle.dev.json";
const policy = JSON.parse(readFileSync(file, "utf8")) as {
  bucket: string;
  rules: { id: string; prefix: string; expireDays: number }[];
};
if (
  policy.bucket !== target.r2Bucket ||
  !policy.rules.length ||
  policy.rules.some((rule) => !["staging/", "sealed/"].includes(rule.prefix) || !(rule.expireDays >= 1))
)
  throw new Error("Unexpected storage lifecycle policy");
for (const rule of policy.rules) {
  cli("npx", [
    "wrangler", "r2", "bucket", "lifecycle", "add",
    policy.bucket, rule.id, rule.prefix,
    "--expire-days", String(rule.expireDays),
    "--force",
  ]);
}
console.log(
  `Applied ${policy.rules.map((rule) => `${rule.prefix} after ${rule.expireDays} days`).join(", ")} to ${policy.bucket}.`,
);
