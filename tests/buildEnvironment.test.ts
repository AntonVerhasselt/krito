import { describe, expect, it } from "vitest";
import { validateBuildEnvironment } from "../shared/buildEnvironment";

const targets = {
  developmentUrl: "https://selected-dev.convex.cloud",
  productionDeployment: "prod:selected-prod",
  productionUrl: "https://selected-prod.convex.cloud",
};
const valid = { KRITO_BACKEND_ENV: "development", NEXT_PUBLIC_CONVEX_URL: targets.developmentUrl };
const production = {
  VERCEL_ENV: "production",
  KRITO_BACKEND_ENV: "production",
  NEXT_PUBLIC_CONVEX_URL: targets.productionUrl,
  CONVEX_DEPLOY_KEY: "prod:selected-prod|test-only-value",
};
describe("frontend build isolation", () => {
  it("builds previews, CI and local builds against development", () => {
    expect(validateBuildEnvironment(valid, targets)).toBe("development");
    expect(validateBuildEnvironment({ ...valid, VERCEL_ENV: "preview" }, targets)).toBe("development");
  });
  it("rejects an unselected deployment or production backend outside Vercel Production", () => {
    expect(() => validateBuildEnvironment({ ...valid, NEXT_PUBLIC_CONVEX_URL: "https://other.convex.cloud" }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...valid, KRITO_BACKEND_ENV: "production" }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...production, VERCEL_ENV: "preview" }, targets)).toThrow();
  });
  it("builds Vercel Production against the production deployment", () => {
    expect(validateBuildEnvironment(production, targets)).toBe("production");
    // `convex deploy` supplies the URL itself.
    expect(validateBuildEnvironment({ ...production, NEXT_PUBLIC_CONVEX_URL: undefined }, targets)).toBe("production");
  });
  it("rejects Vercel Production without the production backend and its own deploy key", () => {
    expect(() => validateBuildEnvironment({ ...production, KRITO_BACKEND_ENV: "development" }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...production, CONVEX_DEPLOY_KEY: undefined }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...production, CONVEX_DEPLOY_KEY: "dev:selected-dev|test-only-value" }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...production, CONVEX_DEPLOY_KEY: "prod:other|test-only-value" }, targets)).toThrow();
    expect(() => validateBuildEnvironment({ ...production, NEXT_PUBLIC_CONVEX_URL: targets.developmentUrl }, targets)).toThrow();
  });
  it.each(["CONVEX_DEPLOY_KEY", "OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])("rejects %s in development builds", (key) => {
    expect(() => validateBuildEnvironment({ ...valid, [key]: "test-only-value" }, targets)).toThrow();
  });
  it.each(["OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "RESEND_API_KEY", "EMAIL_LINK_SECRET"])("rejects %s in production builds", (key) => {
    expect(() => validateBuildEnvironment({ ...production, [key]: "test-only-value" }, targets)).toThrow();
  });
});
