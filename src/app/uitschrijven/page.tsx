import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { Unsubscribe } from "../../components/Unsubscribe";

export const metadata: Metadata = { title: "Uitschrijven — Krito" };

export default function UnsubscribePage() {
  return (
    <div className="site-shell">
      <SiteHeader>
        <Link href="/">Naar Krito</Link>
      </SiteHeader>
      <main className="privacy-page unsubscribe-page">
        <Unsubscribe />
      </main>
    </div>
  );
}
