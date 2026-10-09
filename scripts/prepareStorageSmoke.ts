import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { assertDevelopment, cli, development } from "./lib";

assertDevelopment();
const token = randomBytes(32).toString("hex");
writeFileSync(".secrets/storage-probe-token", token, { mode: 0o600 });
const hash = createHash("sha256").update(token).digest("hex");
const payload = `SETUP_PROBE_TOKEN_HASH=${hash}\nSETUP_PROBE_EXPIRES_AT=${Date.now() + 2 * 60 * 60_000}`;
cli("npx", ["convex", "env", "set", "--force", "--deployment", development.convexDeployment.slice(4)], payload);
console.log("Prepared temporary development-only storage fixture probe; capability withheld.");
