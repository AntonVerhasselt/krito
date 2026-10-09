import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: () => ({
    environment: process.env.APP_ENV ?? "unconfigured",
    apiRevision: "setup-v1",
    deploymentUrl: process.env.CONVEX_CLOUD_URL,
  }),
});
