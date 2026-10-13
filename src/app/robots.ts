import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // Private pages stay crawlable so search engines can read their noindex.
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
