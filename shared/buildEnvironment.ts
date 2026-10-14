export type BuildTargets = {
  /** URL of the development deployment that local, CI and preview builds use. */
  developmentUrl: string;
  /** Deployment the production deploy key must belong to, e.g. "prod:enduring-duck-0". */
  productionDeployment: string;
  productionUrl: string;
};

/**
 * Only Vercel Production builds against the production backend, and only with
 * that deployment's own deploy key. Everything else stays on development and
 * never receives a deploy key.
 */
export function validateBuildEnvironment(
  environment: Record<string, string | undefined>,
  targets: BuildTargets,
): "development" | "production" {
  for (const name of ["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_LINK_SECRET"]) {
    if (environment[name]) throw new Error(`${name} belongs on the Convex backend, not Vercel.`);
  }
  if (environment.VERCEL_ENV === "production") {
    if (environment.KRITO_BACKEND_ENV !== "production") {
      throw new Error("Vercel Production must set KRITO_BACKEND_ENV=production.");
    }
    if (!environment.CONVEX_DEPLOY_KEY?.startsWith(`${targets.productionDeployment}|`)) {
      throw new Error("Vercel Production needs the deploy key of the production Convex deployment.");
    }
    if (environment.NEXT_PUBLIC_CONVEX_URL && environment.NEXT_PUBLIC_CONVEX_URL !== targets.productionUrl) {
      throw new Error("Frontend URL must match the production Convex deployment.");
    }
    return "production";
  }
  if (environment.KRITO_BACKEND_ENV !== "development") {
    throw new Error("Only Vercel Production may build against the production backend.");
  }
  if (environment.NEXT_PUBLIC_CONVEX_URL !== targets.developmentUrl) {
    throw new Error("Frontend URL must match the selected development Convex deployment.");
  }
  if (environment.CONVEX_DEPLOY_KEY) {
    throw new Error("Only Vercel Production builds may receive a Convex deployment key.");
  }
  return "development";
}
