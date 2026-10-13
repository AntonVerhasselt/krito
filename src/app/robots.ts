import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    // Analyses are private; their pages carry noindex as well.
    rules: { userAgent: "*", allow: "/", disallow: "/results/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
