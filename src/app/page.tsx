import type { Metadata } from "next";
import { Home } from "@/components/home/Home";
import { faq } from "@/content/home";
import { openGraph, siteDescription, siteName, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...openGraph, url: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: siteName,
      description: siteDescription,
      inLanguage: "nl-BE",
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#app`,
      name: siteName,
      url: `${siteUrl}/`,
      description: siteDescription,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      inLanguage: "nl-BE",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      audience: {
        "@type": "EducationalAudience",
        educationalRole: "teacher",
        audienceType: "Leerkrachten basisonderwijs in Vlaanderen",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      inLanguage: "nl-BE",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Home />
    </>
  );
}
