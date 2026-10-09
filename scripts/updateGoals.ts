import { execFileSync } from "node:child_process";
import { assertDevelopment } from "./lib";
import { fetchCatalog } from "./catalog/fetch";
assertDevelopment();
const file = await fetchCatalog();
execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/seedGoals.ts", "--env", "dev", "--file", file],
  { stdio: "inherit" },
);
