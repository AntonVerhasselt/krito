import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { fonts } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Krito — Zicht op je leerdoelen",
  description: "Bekijk welke Op.stap-leerdoelen je lesmateriaal ondersteunt.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={fonts}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
