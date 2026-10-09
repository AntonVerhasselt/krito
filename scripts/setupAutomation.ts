import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { assertDevelopment, cli, development } from "./lib";

assertDevelopment();
const tokenPath = ".secrets/vercel-bypass-token";
if (process.argv.includes("--disable")) {
  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, "utf8").trim();
    cli("npx", ["vercel", "project", "protection", "disable", development.vercelProject,
      "--protection-bypass", "--protection-bypass-secret", token, "--scope", development.vercelScope]);
    rmSync(tokenPath);
  }
  for (const name of ["SETUP_PROBE_TOKEN_HASH", "SETUP_PROBE_EXPIRES_AT"]) {
    cli("npx", ["convex", "env", "remove", name, "--deployment", development.convexDeployment.slice(4)]);
  }
  for (const path of [".secrets/storage-probe-token", ".secrets/vercel-protection.json"]) {
    rmSync(path, { force: true });
  }
  console.log("Temporary setup capabilities revoked; deployment protection remains enabled.");
} else {
  if (existsSync(tokenPath)) {
    console.log("Existing local setup automation capability retained.");
  } else {
    const raw = cli("npx", ["vercel", "project", "protection", "enable", development.vercelProject,
      "--protection-bypass", "--json", "--scope", development.vercelScope]);
    const result = JSON.parse(raw) as { protectionBypass: Record<string, unknown> };
    const tokens = Object.keys(result.protectionBypass ?? {});
    if (tokens.length !== 1) throw new Error("Cannot safely choose among multiple automation capabilities.");
    writeFileSync(tokenPath, tokens[0], { mode: 0o600 });
    console.log("Prepared protected browser setup automation capability; value withheld.");
  }
}
