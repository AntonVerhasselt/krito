import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

/** Only the public pages; the material step, results and unsubscribe page are noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
