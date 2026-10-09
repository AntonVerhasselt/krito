import { GoalSetPicker } from "@/components/GoalSetPicker";
import Link from "next/link";
export default function Home() {
  return (
    <div className="site-shell">
      <header>
        <Link href="/" className="wordmark" aria-label="Krito startpagina">
          krito<span>.</span>
        </Link>
        <span className="environment-pill">In ontwikkeling</span>
      </header>
      <main className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> MEER ZICHT OP JE LESMATERIAAL
          </div>
          <h1>
            Je lesmateriaal.
            <br />
            <em>Helder bekeken.</em>
          </h1>
          <p className="intro">
            Ontdek welke Op.stap-leerdoelen aan bod komen in je materiaal. Met
            een beoordeling per doel en verwijzingen naar je documenten.
          </p>
          <div className="hero-assurance">
            <span className="assurance-icon">✓</span>
            <p>
              De volledige doelenlijst van je onderwerp.
              <br />
              <span>Meer overzicht. Ruimte voor jouw oordeel.</span>
            </p>
          </div>
        </div>
        <GoalSetPicker />
      </main>
      <footer>
        <span>Gemaakt voor leerkrachten, met oog voor je lespraktijk.</span>
        <span>Krito · Ontwikkelversie</span>
      </footer>
    </div>
  );
}
