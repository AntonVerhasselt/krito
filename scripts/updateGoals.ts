import { execFileSync } from "node:child_process";
import { assertDevelopment, assertProduction } from "./lib";
import { fetchCatalog } from "./catalog/fetch";
// Development by default; `-- --production` refreshes the launched catalog.
const env = process.argv.includes("--production") ? "prod" : "dev";
if (env === "prod") assertProduction();
else assertDevelopment();
const file = await fetchCatalog();
execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/seedGoals.ts", "--env", env, "--file", file],
  { stdio: "inherit" },
);
