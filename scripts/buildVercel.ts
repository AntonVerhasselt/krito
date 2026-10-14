import { spawnSync } from "node:child_process";
import { development, production } from "./lib";
import { validateBuildEnvironment } from "../shared/buildEnvironment";

const target = validateBuildEnvironment(process.env, {
  developmentUrl: development.convexUrl,
  productionDeployment: production.convexDeployment,
  productionUrl: production.convexUrl,
});
// Production publishes the backend first, then builds the frontend against the
// URL Convex returns, so both always ship the same commit. Previews, CI and
// local builds only build the frontend against development.
const [command, args] =
  target === "production"
    ? ["npx", ["convex", "deploy", "--cmd", "npm run build", "--cmd-url-env-var-name", "NEXT_PUBLIC_CONVEX_URL"]]
    : ["npm", ["run", "build"]];
console.log(
  target === "production"
    ? `Building with Node ${process.version}: publishing the production backend, then the frontend.`
    : `Building frontend with Node ${process.version} against development; no backend publication.`,
);
const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) throw new Error("Unable to launch the build.");
process.exit(result.status ?? 1);
