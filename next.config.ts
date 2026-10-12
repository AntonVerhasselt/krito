import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // The persisted dev cache has served deleted routes and stale CSS after
    // restarts in this project; recompiling from scratch is reliable.
    turbopackFileSystemCacheForDev: false,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID,
      host: "https://eu.posthog.com",
      sourcemaps: { enabled: true, deleteAfterUpload: true, releaseName: "krito",
        releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_KRITO_RELEASE },
    })
  : nextConfig;
