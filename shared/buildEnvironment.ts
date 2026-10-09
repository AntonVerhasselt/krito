export function validateBuildEnvironment(
  environment: Record<string, string | undefined>,
  expectedUrl: string,
): void {
  if (environment.KRITO_BACKEND_ENV !== "development") {
    throw new Error("KRITO_BACKEND_ENV must be development until launch is authorized.");
  }
  if (environment.NEXT_PUBLIC_CONVEX_URL !== expectedUrl) {
    throw new Error("Frontend URL must match the selected development Convex deployment.");
  }
  if (environment.CONVEX_DEPLOY_KEY) {
    throw new Error("Frontend builds must not receive a Convex deployment key.");
  }
  for (const name of ["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    if (environment[name]) throw new Error(`${name} belongs on the Convex backend, not Vercel.`);
  }
}
