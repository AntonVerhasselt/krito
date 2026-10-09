import { describe, expect, it } from "vitest";
import { validateBuildEnvironment } from "../shared/buildEnvironment";

const url = "https://selected-dev.convex.cloud";
const valid = { KRITO_BACKEND_ENV: "development", NEXT_PUBLIC_CONVEX_URL: url };
describe("frontend build isolation", () => {
  it("allows the selected development backend for Vercel Production", () => {
    expect(() => validateBuildEnvironment({ ...valid, VERCEL_ENV: "production" }, url)).not.toThrow();
  });
  it("rejects an unselected deployment or production backend", () => {
    expect(() => validateBuildEnvironment({ ...valid, NEXT_PUBLIC_CONVEX_URL: "https://other.convex.cloud" }, url)).toThrow();
    expect(() => validateBuildEnvironment({ ...valid, KRITO_BACKEND_ENV: "production" }, url)).toThrow();
  });
  it.each(["CONVEX_DEPLOY_KEY", "OPENAI_API_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])("rejects %s in frontend builds", (key) => {
    expect(() => validateBuildEnvironment({ ...valid, [key]: "test-only-value" }, url)).toThrow();
  });
});
