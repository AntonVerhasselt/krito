import { afterEach, describe, expect, it, vi } from "vitest";

/* site.ts reads VERCEL_ENV once, so each case imports the modules fresh. */
async function load(vercelEnv: string | undefined) {
  vi.resetModules();
  // Always stub, so a VERCEL_ENV on the machine running the tests can't leak in.
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  const [{ default: robots }, { default: sitemap }, { metadata }] = await Promise.all([
    import("../src/app/robots"),
    import("../src/app/sitemap"),
    import("../src/app/layout"),
  ]);
  return { robots: robots(), sitemap: sitemap(), metadata };
}

vi.mock("../src/app/fonts", () => ({ fonts: "" }));
vi.mock("../src/app/providers", () => ({ Providers: () => null }));

afterEach(() => vi.unstubAllEnvs());

describe("search engine indexing", () => {
  it("lets crawlers index the production site", async () => {
    const { robots, metadata } = await load("production");
    expect(robots.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(robots.sitemap).toBe("https://www.krito.be/sitemap.xml");
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it.each([undefined, "", "preview", "development"])("keeps builds with VERCEL_ENV=%s out of search results", async (env) => {
    const { robots, metadata } = await load(env);
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("lists only public pages in the sitemap", async () => {
    const { sitemap } = await load("production");
    expect(sitemap.map((entry) => entry.url)).toEqual(["https://www.krito.be/", "https://www.krito.be/privacy"]);
  });
});
