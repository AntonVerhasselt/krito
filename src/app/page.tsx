import Image from "next/image";
import { SiteHeader, StatusIcon } from "@/components/SiteHeader";
import { TopicPicker } from "@/components/TopicPicker";
import { ResultsDemo } from "@/components/ResultsDemo";
import { BackToSearch } from "@/components/BackToSearch";
import thinking from "../../public/illustrations/krito-thinking.webp";
import sleepy from "../../public/illustrations/krito-sleepy.webp";

const steps = [
  {
    title: "Kies een onderwerp",
    text: "Zoek in Op.stap op onderwerp en leerjaar. Krito neemt alle leerplandoelen van dat onderwerp mee; je hoeft niets aan te vinken.",
  },
  {
    title: "Voeg je materiaal toe",
    text: "Lesvoorbereidingen, presentaties, oefenbladen en toetsen. Pdf, Word, PowerPoint, Excel of een foto van een werkblad.",
  },
  {
    title: "Lees per doel na",
    text: "Gedekt, gedeeltelijk, niet gevonden of onzeker. Met uitleg, wat ontbreekt en de pagina in je eigen bestand.",
  },
];

const faq = [
  {
    q: "Zegt Krito of mijn leerlingen de doelen bereiken?",
    a: "Nee. Krito kijkt of je lesmateriaal een leerdoel ondersteunt, niet wat je leerlingen kennen of kunnen. Dat blijft jouw vakmanschap.",
  },
  {
    q: "Met welke doelen werkt Krito?",
    a: "Met de leerplandoelen van Op.stap. Je kiest een onderwerp en een leerjaar, en Krito neemt alle doelen van dat onderwerp mee. Andere leerplannen, zoals die van GO! of OVSG, zijn er nog niet.",
  },
  {
    q: "Hoe weet ik of een beoordeling klopt?",
    a: "Bij elk doel zie je een uitleg, hoe zeker Krito is, wat er ontbreekt en de pagina’s en citaten uit je eigen bestanden. Is de eerste beoordeling niet zeker genoeg, dan kijkt een tweede model dat doel nog eens apart na.",
  },
  {
    q: "Is dit een bewijs voor de inspectie?",
    a: "Nee. Krito is geen inspectie-instrument en de inspectie vraagt geen extra documenten. Krito helpt je vooral zien waar je materiaal sterk is en waar je moet aanvullen.",
  },
  {
    q: "Welke bestanden kan ik toevoegen?",
    a: "Pdf, Word, PowerPoint, Excel, CSV, tekstbestanden en afbeeldingen zoals een foto van een werkblad. Tot 20 bestanden per analyse. Hoe meer materiaal, hoe vollediger het beeld.",
  },
  {
    q: "Wie ziet mijn documenten?",
    a: "Je analyse is privé: je opent ze alleen in de browser waarin je ze startte. Om je bestanden na te kijken, worden ze verwerkt door een AI-model van OpenAI. Ze worden niet gedeeld met je school of met andere gebruikers.",
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">
              <span>Wat dekt je les</span> <span>al van Op.stap?</span>
            </h1>
            <p className="hero-intro">
              Met de nieuwe minimumdoelen ga je zelf na of je methode en je
              eigen materiaal de leerplandoelen dekken. Kies een onderwerp, voeg
              je lessen toe en zie per leerdoel wat er al in zit en waar je kan
              aanvullen.
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
        </section>

        <section className="home-section why" aria-labelledby="why-title">
          <Image
            src={sleepy}
            alt="Krito werkt 's avonds laat aan zijn lesvoorbereiding"
            sizes="(max-width: 860px) 92vw, 46vw"
            className="why-art"
          />
          <div className="why-copy">
            <h2 id="why-title">
              Je hoeft niet alles opnieuw te maken. Wel weten waar je staat.
            </h2>
            <p>
              Sinds 1 september gelden de nieuwe minimumdoelen voor Nederlands,
              wiskunde en wetenschap en techniek, van de kleuterklas tot het
              derde leerjaar. Andere vakken volgen vanaf volgend schooljaar.
              Veel aangepaste methodes verschijnen pas de komende jaren. Tot dan
              vul je zelf aan, met de lessen die je al hebt.
            </p>
            <ul className="quotes">
              <li>
                <blockquote>
                  Scholen en leraren moeten zelf nagaan of een methode de nieuwe
                  minimumdoelen dekt.
                </blockquote>
                <a
                  href="https://www.klasse.be/775114/nieuwe-minimumdoelen-basisonderwijs-2/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Klasse, april 2026
                </a>
              </li>
              <li>
                <blockquote>
                  Lesmateriaal maken voor volledig nieuwe minimumdoelen vraagt
                  in ideale omstandigheden makkelijk twee jaar zwoegen.
                </blockquote>
                <a
                  href="https://g-o.be/nieuwe-minimumdoelen-basisonderwijs-wat-nu/"
                  target="_blank"
                  rel="noreferrer"
                >
                  GO! onderwijs, mei 2025
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section className="home-section steps" aria-labelledby="steps-title">
          <h2 id="steps-title">Zo werkt het</h2>
          <ol>
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="step-number" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-section demo" aria-labelledby="demo-title">
          <div className="demo-intro">
            <h2 id="demo-title">Per leerdoel een eerlijk antwoord</h2>
            <p>
              Een voorbeeld met de echte Op.stap-doelen voor Magnetisme, derde
              leerjaar. Klik een doel open om de uitleg en de verwijzingen te
              zien.
            </p>
          </div>
          <ResultsDemo />
        </section>

        <section className="home-section scope" aria-labelledby="scope-title">
          <h2 id="scope-title">Een hulpmiddel, geen extra controle</h2>
          <div className="scope-columns">
            <div>
              <h3>Wat Krito doet</h3>
              <ul>
                <li>
                  <StatusIcon status="covered" size={26} />
                  Je bestaande bestanden lezen, zonder dat je een matrix invult.
                </li>
                <li>
                  <StatusIcon status="covered" size={26} />
                  Per leerdoel tonen wat er al in zit en wat ontbreekt.
                </li>
                <li>
                  <StatusIcon status="covered" size={26} />
                  Verwijzen naar de pagina en het citaat, zodat je het zelf
                  nakijkt.
                </li>
                <li>
                  <StatusIcon status="covered" size={26} />
                  Eerlijk zeggen wanneer het twijfelt.
                </li>
              </ul>
            </div>
            <div>
              <h3>Wat Krito niet doet</h3>
              <ul>
                <li>
                  <StatusIcon status="not_found" size={26} />
                  Iets zeggen over wat je leerlingen kennen of kunnen.
                </li>
                <li>
                  <StatusIcon status="not_found" size={26} />
                  Een dossier voor de inspectie maken.
                </li>
                <li>
                  <StatusIcon status="not_found" size={26} />
                  Beslissen wat je met je lessen doet. Dat bepaal jij, met je
                  team.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="home-section faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Vragen van leraren</h2>
          <div className="faq-list">
            {faq.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <svg
                    className="chevron"
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="m5 8 5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="home-section closing"
          aria-labelledby="closing-title"
        >
          <h2 id="closing-title">Begin met één onderwerp</h2>
          <p>
            Kies het onderwerp waar je nu les over geeft en voeg je materiaal
            toe. Zo zie je meteen of Krito je tijd bespaart.
          </p>
          <BackToSearch />
        </section>
      </main>
      <footer className="site-footer">
        <p>
          Krito is een onafhankelijk hulpmiddel en niet verbonden aan Katholiek
          Onderwijs Vlaanderen. De leerplandoelen komen uit Op.stap.
        </p>
      </footer>
    </div>
  );
}
