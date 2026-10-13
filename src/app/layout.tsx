import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { fonts } from "./fonts";
import { indexable, noIndex, openGraph, siteDescription, siteName, siteUrl } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Krito — Leg je lessen naast de Op.stap-leerplandoelen",
    template: "%s — Krito",
  },
  description: siteDescription,
  applicationName: siteName,
  robots: indexable
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : noIndex,
  openGraph,
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#e1e5e4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl-BE" className={fonts}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
