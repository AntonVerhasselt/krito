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
      <main>
        <div className="eyebrow">
          <span /> MEER ZICHT OP JE LESMATERIAAL
        </div>
        <h1>
          Van lesmateriaal
          <br />
          naar <em>heldere inzichten.</em>
        </h1>
        <p className="intro">
          Welke leerdoelen komen aan bod in je lesmateriaal? Krito helpt je de
          verbinding te zien — met een beoordeling per Op.stap-doel en
          verwijzingen naar je documenten.
        </p>
        <GoalSetPicker />
      </main>
      <footer>
        <span>Meer overzicht. Ruimte voor jouw oordeel.</span>
        <span>Krito · Ontwikkelversie</span>
      </footer>
    </div>
  );
}
