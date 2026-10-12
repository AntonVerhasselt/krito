import { defineApp } from "convex/server";
import posthog from "@posthog/convex/convex.config.js";
import { v } from "convex/values";

const app = defineApp({ env: {
  POSTHOG_PROJECT_TOKEN: v.string(),
  POSTHOG_HOST: v.string(),
} });
app.use(posthog, {
  env: {
    POSTHOG_PROJECT_TOKEN: app.env.POSTHOG_PROJECT_TOKEN,
    POSTHOG_HOST: app.env.POSTHOG_HOST,
    // No personal API key: this integration captures telemetry without flag polling.
  },
});
export default app;
