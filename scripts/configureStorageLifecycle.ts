import { readFileSync } from "node:fs";
import { assertDevelopment, cli, development } from "./lib";
assertDevelopment();
const rule = JSON.parse(readFileSync("infra/r2-lifecycle.dev.json", "utf8"));
if (
  rule.bucket !== development.r2Bucket ||
  rule.prefix !== "staging/" ||
  rule.expireDays !== 1 ||
  rule.id !== "krito-abandoned-staging"
)
  throw new Error("Unexpected staging lifecycle policy");
cli("npx", [
  "wrangler",
  "r2",
  "bucket",
  "lifecycle",
  "add",
  rule.bucket,
  rule.id,
  rule.prefix,
  "--expire-days",
  String(rule.expireDays),
  "--force",
]);
console.log(
  "Applied one-day expiry to staging objects in the development bucket.",
);
