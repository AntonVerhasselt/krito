import type { Metadata } from "next";

/** The public address; krito.be redirects here. */
export const siteUrl = "https://www.krito.be";

export const siteName = "Krito";

export const siteDescription =
  "Krito leest je lesvoorbereidingen, werkbladen en toetsen en toont per Op.stap-leerplandoel wat er al in zit en wat nog ontbreekt. Gratis voor elke leerkracht.";

/**
 * Only the production deployment may be indexed. Previews, local builds and
 * generated Vercel URLs tell crawlers to stay away.
 */
export const indexable = process.env.VERCEL_ENV === "production";

/** Next.js replaces, not merges, a page's openGraph: spread this into each one. */
export const openGraph = {
  type: "website",
  locale: "nl_BE",
  siteName,
} satisfies Metadata["openGraph"];

/** For private or transactional pages: never in search results. */
export const noIndex: Metadata["robots"] = { index: false, follow: false };
