import { BackendHealth } from '@/components/BackendHealth';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="site-shell">
      <header><Link href="/" className="wordmark" aria-label="Krito startpagina">krito<span>.</span></Link><span className="environment-pill">In ontwikkeling</span></header>
      <main>
        <div className="eyebrow"><span /> MEER ZICHT OP JE LESMATERIAAL</div>
        <h1>Van lesmateriaal<br />naar <em>heldere inzichten.</em></h1>
        <p className="intro">Welke leerdoelen komen aan bod in je lesmateriaal? Krito helpt je de verbinding te zien — met een beoordeling per Op.stap-doel en verwijzingen naar je documenten.</p>
        <div className="flow-overview" aria-label="Hoe Krito werkt">
          <article><span className="step">01</span><h2>Kies je leerdoelen</h2><p>Vertrek vanuit de officiële Op.stap-doelen die je wilt bekijken.</p></article>
          <article><span className="step">02</span><h2>Voeg je materiaal toe</h2><p>Upload je pdf’s. Je documenten worden privé bewaard.</p></article>
          <article><span className="step">03</span><h2>Bekijk je analyse</h2><p>Ontdek per doel wat ondersteund wordt en wat nog ontbreekt.</p></article>
        </div>
        <div className="setup-note"><h2>We maken Krito klaar voor gebruik</h2><p>De ontwikkelomgeving wordt gecontroleerd. Je kunt binnenkort hier je eerste analyse starten.</p><BackendHealth /></div>
      </main>
      <footer><span>Meer overzicht. Ruimte voor jouw oordeel.</span><span>Krito · Ontwikkelversie · Preview 1</span></footer>
    </div>
  );
}
