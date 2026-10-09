import { spawnSync } from "node:child_process";
import { development } from "./lib";
import { validateBuildEnvironment } from "../shared/buildEnvironment";

validateBuildEnvironment(process.env, development.convexUrl);
console.log(`Building frontend with Node ${process.version} against development; no backend publication.`);
const result = spawnSync("npm", ["run", "build"], { stdio: "inherit" });
if (result.error) throw new Error("Unable to launch frontend build.");
process.exit(result.status ?? 1);
