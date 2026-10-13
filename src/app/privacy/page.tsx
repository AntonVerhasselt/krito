import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { openGraph } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Hoe Krito met je lesmateriaal, je e-mailadres en je privacykeuze omgaat.",
  alternates: { canonical: "/privacy" },
  openGraph: { ...openGraph, url: "/privacy" },
};

export default function PrivacyPage() {
  return <div className="site-shell">
    <SiteHeader><Link href="/">Terug naar Krito</Link></SiteHeader>
    <main className="privacy-page">
      <h1>Je gegevens in Krito</h1>
      <p>Je bestanden zijn privé. Je analyse is alleen toegankelijk met de toegangssleutel in het tabblad waarin je ze startte. OpenAI verwerkt je materiaal om de leerdoelen na te kijken. Je schoolmail wordt bij de analyse bewaard; dat is geen geverifieerd account.</p>
      <h2>E-mail</h2>
      <p>Als je je e-mailadres invult, sturen we je het verslag van je analyse als pdf, en drie korte mails van Anton over hoe Krito werkt. Vraag je op je gsm een link naar jezelf aan, dan sturen we je die link. We versturen mails via Resend. We zien of een mail geopend wordt en of er op een link geklikt wordt, zodat we weten welke mails nuttig zijn. Het verslag bevat de namen van je bestanden en citaten eruit. Krito bewaart zelf geen kopie van de pdf. Uitschrijven kan onderaan elk van die drie mails, en je e-mailadres gebruiken we niet voor iets anders.</p>
      <h2>Met jouw toestemming</h2>
      <p>We gebruiken PostHog in de EU om te zien welke stappen werken en waar mensen vastlopen. We meten klikken, zoeken, uploads, de voortgang van analyses en fouten. We bewaren technische gegevens zoals bestandstype, grootte, aantallen en tijdsduur.</p>
      <p>Zo ontdekken we wat goed werkt en waar mensen vastlopen, en kunnen we Krito eenvoudiger en betrouwbaarder maken. We maken geen sessieopnames. We sturen geen bestanden, bestandsnamen, documentcitaten, toegangssleutels of zoekopdrachten naar PostHog.</p>
      <p>Als je een analyse start, koppelen we je gebruik aan je schoolmail. PostHog bewaart je e-mailadres en het domein apart. Dat helpt ons terugkerend gebruik te begrijpen. Het geeft je school geen toegang tot je materiaal.</p>
      <h2>Je kiest zelf</h2>
      <p>Met ‘Nee, bedankt’ kun je Krito blijven gebruiken zonder deze metingen. Met ‘Privacykeuze’ onderaan kun je je keuze later aanpassen. Intrekken stopt nieuwe metingen; gegevens die al verstuurd zijn worden daarmee niet automatisch verwijderd.</p>
      <p>We bewaren je privacykeuze in je browser. Na toestemming bewaart PostHog ook een gebruiks-ID en sessie-ID in je browser om bezoeken te verbinden.</p>
    </main>
  </div>;
}
