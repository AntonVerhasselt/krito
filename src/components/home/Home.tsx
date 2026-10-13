import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import anton from "../../../public/anton.webp";
import {
  Chevron,
  ExternalIcon,
  StatusIcon,
  type Status,
} from "@/components/brand";
import { TopicPicker } from "@/components/TopicPicker";
import { ResultsDemo } from "@/components/ResultsDemo";
import { BackToSearch } from "@/components/BackToSearch";
import { disclaimer, faq, quotes } from "@/content/home";
import { demoFiles } from "@/lib/demoAnalysis";
import { FreeMark } from "./FreeMark";
import { LessonSheet } from "./LessonSheet";
import { StepPairs } from "./StepPairs";
import { SiteNav } from "./SiteNav";
import { HomeAnalytics } from "./HomeAnalytics";

/* Claims follow docs/product-decisions.md. */

/** One of each verdict, including a goal that stays unsure after the second check. */
const exampleIds = ["3.5.GL3.14", "3.5.GL3.15", "3.5.GL3.18", "3.5.GL3.19"];

const key: { status: Status; label: string; text: string }[] = [
  {
    status: "covered",
    label: "Gedekt",
    text: "je materiaal ondersteunt het doel.",
  },
  {
    status: "partial",
    label: "Gedeeltelijk gedekt",
    text: "een deel zit erin; Krito zegt wat ontbreekt.",
  },
  {
    status: "not_found",
    label: "Niet gevonden",
    text: "er staat niets over in je bestanden.",
  },
  {
    status: "uncertain",
    label: "Onzeker",
    text: "ook na een tweede controle; kijk het zelf na.",
  },
];

const does = [
  "Leest je lesvoorbereidingen en documenten.",
  "Toont per doel wat er al in zit en wat ontbreekt.",
  "Wijst pagina en citaat aan. Nakijken is supergemakkelijk.",
  "Gokt niet. Twijfelt Krito, dan zegt het dat ook.",
];

const doesNot = [
  "Zegt niets over wat je leerlingen kennen of kunnen.",
  "Maakt geen dossier of bewijs voor de inspectie.",
  "Deelt je bestanden niet met je school of collega's.",
  "Beslist niet wat je met je lessen doet.",
];

const free = [
  { title: "Geen abonnement", text: "Je betaalt niets, ook niet per analyse." },
  {
    title: "Alle onderwerpen",
    text: "Elk onderwerp uit Op.stap, van de kleuterklas tot het 6de leerjaar.",
  },
  {
    title: "Het volledige verslag",
    text: "Per doel de uitleg, de verwijzingen en wat nog ontbreekt.",
  },
];

/** Heading lines that only break between phrases. */
function Clause({ children }: { children: string }) {
  return <span className="clause">{children}</span>;
}

/** A short red pen stroke: "not this". */
function Struck() {
  return (
    <svg
      className="scope-strike"
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M4.5 12.6c5-.9 10-1.2 15-.7" />
    </svg>
  );
}

export function Home() {
  return (
    <div className="site-shell">
      <HomeAnalytics />
      <SiteHeader sticky>
        <SiteNav />
      </SiteHeader>
      <main>
        <section className="hero" aria-labelledby="hero-title" data-landing-section="hero">
          <div className="hero-copy">
            <h1 id="hero-title" className="hero-title">
              Klopt je les nog met het nieuwe leerplan?
            </h1>
            <p className="hero-intro">
              Krito leest je lesvoorbereidingen, werkbladen en toetsen, en toont
              per leerplandoel wat er al in zit en wat nog ontbreekt. Zo hoef je
              niet zelf elke les naast elk doel te leggen.
            </p>
            <TopicPicker />
          </div>
          <LessonSheet />
        </section>

        <section className="home-section why" aria-labelledby="why-title" data-landing-section="why">
          <div className="why-copy">
            <h2 id="why-title">
              <Clause>Te veel werk</Clause> <Clause>naast de klas</Clause>
            </h2>
            <p>
              Verslagen, zorgdossiers, aanstiplijsten, berichten van ouders,
              overleg na de bel. En nu ook nog nagaan of al je lessen kloppen
              met het nieuwe leerplan. Veel daarvan doe je &apos;s avonds of in
              het weekend, en niemand ziet het. Je koos voor de klas, maar
              steeds meer van je tijd gaat naar alles errond.
            </p>
          </div>
          <div className="sources">
            {quotes.map((q) => (
              <figure key={q.href} className="source">
                <blockquote>{q.text}</blockquote>
                <figcaption>
                  <a href={q.href} target="_blank" rel="noreferrer" data-external-reference>
                    {q.source} <ExternalIcon />
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section
          id="hoe-werkt-het"
          data-landing-section="steps"
          className="home-section steps"
          aria-labelledby="steps-title"
        >
          <h2 id="steps-title">
            <Clause>Je lessen erin,</Clause>{" "}
            <Clause>een overzicht per doel eruit</Clause>
          </h2>
          <StepPairs />
        </section>

        <section
          id="voorbeeld"
          data-landing-section="example"
          className="home-section demo"
          aria-labelledby="demo-title"
        >
          <div className="section-rail">
            <h2 id="demo-title">Zo ziet je overzicht eruit</h2>
            <p className="rail-lede">
              Een voorbeeld met de echte Op.stap-doelen voor Magnetisme in het
              3de leerjaar. Open een doel om de uitleg en de citaten te lezen.
            </p>
            <div className="verdict-key">
              <h3>Zo lees je het</h3>
              <ul>
                {key.map((k) => (
                  <li key={k.status}>
                    <StatusIcon status={k.status} size={22} />
                    <span>
                      <b>{k.label}</b>: {k.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="section-body">
            <div className="report-sheet">
              <div className="report-head">
                <p className="report-title">Magnetisme</p>
                <p className="report-files">
                  {demoFiles.map((f) => (
                    <span key={f.fileId}>{f.name}</span>
                  ))}
                </p>
              </div>
              <ResultsDemo ids={exampleIds} />
            </div>
          </div>
        </section>

        <section className="home-section scope" aria-labelledby="scope-title" data-landing-section="scope">
          <h2 id="scope-title">
            <Clause>Krito wijst aan.</Clause> <Clause>Jij beslist.</Clause>
          </h2>
          <div className="scope-cards">
            <div className="scope-card">
              <h3>Wat Krito doet</h3>
              <ul>
                {does.map((item) => (
                  <li key={item}>
                    <StatusIcon status="covered" size={24} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="scope-card">
              <h3>Wat Krito niet doet</h3>
              <ul>
                {doesNot.map((item, i) => (
                  <li key={item}>
                    <Struck />
                    <span>
                      {item}
                      {i === doesNot.length - 1 && (
                        <span className="scope-note" aria-hidden="true">
                          jij beslist
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          id="prijs"
          data-landing-section="price"
          className="home-section price"
          aria-labelledby="price-title"
        >
          <div className="leaf price-leaf">
            <div className="price-head">
              <h2 id="price-title">
                <span className="price-kicker">Krito is</span> <FreeMark />
              </h2>
              <p>Voor elke leerkracht, in elke school.</p>
            </div>
            <ul className="price-facts">
              {free.map((f) => (
                <li key={f.title}>
                  <StatusIcon status="covered" size={26} />
                  <span>
                    <b>{f.title}</b>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
            <article className="maker-note" aria-labelledby="maker-title">
              <Image
                src={anton}
                alt="Anton met Charlotte in de zetel"
                className="maker-photo"
                sizes="(max-width: 900px) 132px, 168px"
              />
              <div className="maker-text">
                <h3 id="maker-title">Waarom ik Krito maak</h3>
                <p>
                  Ik ben Anton, papa van Charlotte en Arthur. Over ons onderwijs
                  lees ik veel in de krant, en zelden goed nieuws. Wat me
                  opvalt: bijna elke oplossing komt neer op extra werk voor
                  leerkrachten.
                </p>
                <p>
                  Ik denk dat het andersom moet. Een leerkracht hoort les te
                  geven, niet te verdrinken in administratie, berichten van
                  ouders of lesplannen die telkens herschreven worden voor de
                  inspectie. Lesgeven, daar draait het om.
                </p>
                <p>
                  Daarom maak ik Krito: een eerste stap om leerkrachten werk uit
                  handen te nemen, in plaats van er werk bij te geven. Voorlopig
                  betaal ik alle kosten zelf. Benieuwd waar dit avontuur ons
                  brengt.
                </p>
                <p className="maker-sign">
                  <span className="maker-signature">Anton</span>
                  <span>Maker van Krito</span>
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="home-section faq" aria-labelledby="faq-title" data-landing-section="faq">
          <div className="section-rail">
            <h2 id="faq-title">Voor je begint</h2>
            <p className="rail-lede">
              Over je bestanden, je gegevens en hoe je een beoordeling nakijkt.
            </p>
          </div>
          <div className="section-body faq-list">
            {faq.map((item, index) => (
              <details key={item.q} name="faq" data-faq-id={`faq_${index + 1}`}>
                <summary>
                  {item.q}
                  <Chevron />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="home-section closing"
          data-landing-section="closing"
          aria-labelledby="closing-title"
        >
          <div className="leaf closing-leaf">
            <h2 id="closing-title">
              <Clause>Begin met het onderwerp</Clause>{" "}
              <Clause>van deze week</Clause>
            </h2>
            <p>
              Kies het onderwerp waar je nu mee bezig bent en voeg je materiaal
              toe.
            </p>
            <BackToSearch />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <p>{disclaimer}</p>
      </footer>
    </div>
  );
}
