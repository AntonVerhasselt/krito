import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { TopicPicker } from "@/components/TopicPicker";
import thinking from "../../public/illustrations/krito-thinking.webp";

export default function Home() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">
            <span>Staat elk leerdoel</span> <span>echt in je les?</span>
          </h1>
          <p className="hero-intro">
            Kies een onderwerp uit Op.stap en voeg je lesmateriaal toe:
            lesvoorbereidingen, presentaties, oefenbladen en toetsen. Krito
            houdt elk leerdoel naast je materiaal en toont wat er al in zit,
            met paginaverwijzingen om zelf na te kijken.
          </p>
          <TopicPicker />
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-glow" />
          <Image
            src={thinking}
            alt=""
            priority
            sizes="(max-width: 860px) 92vw, 52vw"
            className="hero-illustration"
          />
        </div>
      </main>
    </div>
  );
}
