import { spawnSync } from "node:child_process";
import { development } from "./lib";
import { validateBuildEnvironment } from "../shared/buildEnvironment";

validateBuildEnvironment(process.env, development.convexUrl);

/**
 * Source maps go to PostHog with a personal API key. A revoked or expired key
 * must not stop a release, so the upload is skipped (loudly) when PostHog
 * doesn't accept the key.
 */
async function sourceMapKeyWorks(key: string) {
  try {
    const response = await fetch("https://eu.posthog.com/api/personal_api_keys/@current/", {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    // 401: unknown, revoked or expired key. A narrowly scoped key may get 403
    // here and still upload source maps.
    return response.status !== 401;
  } catch {
    // PostHog unreachable: the upload would fail the build as well.
    return false;
  }
}

const env = { ...process.env };
if (env.POSTHOG_PERSONAL_API_KEY && !(await sourceMapKeyWorks(env.POSTHOG_PERSONAL_API_KEY))) {
  console.warn(
    "WARNING: PostHog rejected POSTHOG_PERSONAL_API_KEY; building without uploading source maps. " +
      "Replace the key on Vercel (see docs/analytics.md) to get readable stack traces again.",
  );
  delete env.POSTHOG_PERSONAL_API_KEY;
}
console.log(`Building frontend with Node ${process.version} against development; no backend publication.`);
const result = spawnSync("npm", ["run", "build"], { stdio: "inherit", env });
if (result.error) throw new Error("Unable to launch frontend build.");
process.exit(result.status ?? 1);
