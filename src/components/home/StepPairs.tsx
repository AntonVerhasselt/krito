import { StatusIcon } from "@/components/brand";

/** The pen stroke that joins two things on this site; here between a pair of fragments. */
function Link() {
  return (
    <svg
      className="frag-link"
      viewBox="0 0 56 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 12.5c9-3.4 20 3.2 30-.4 5.5-2 10.6-1.8 17.4-.3" />
      <path d="M44.6 7.4 51 12l-6.2 4.6" />
    </svg>
  );
}

function Slip({ name }: { name: string }) {
  return <span className="frag-slip">{name}</span>;
}

const steps = [
  {
    title: "Kies een onderwerp",
    text: "Zoek op onderwerp en leerjaar. Alle doelen van dat onderwerp gaan mee; je vinkt niets aan.",
    from: (
      <div className="frag frag-search">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <span>magnetisme</span>
        <i />
      </div>
    ),
    to: (
      <div className="frag frag-sheet">
        <b>Magnetisme</b>
        <small>3de leerjaar, 6 doelen</small>
        <span className="frag-boxes">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </span>
      </div>
    ),
  },
  {
    title: "Voeg je materiaal toe",
    text: "Lesvoorbereiding, presentatie, werkblad, toets. Een foto van een blad op papier werkt ook.",
    from: (
      <div className="frag frag-files">
        <Slip name="Les magnetisme.pptx" />
        <Slip name="Oefenbundel.docx" />
        <Slip name="Foto werkblad.jpg" />
      </div>
    ),
    to: (
      <div className="frag frag-mini-pair">
        <span className="mini-doc" />
        <svg viewBox="0 0 30 40" fill="none">
          <path d="M1 9c12 0 16 4 28 4M1 20c12 0 16-1 28 4M1 30c12 0 16-12 28-6" />
        </svg>
        <span className="mini-list" />
      </div>
    ),
  },
  {
    title: "Lees per doel na",
    text: "Per doel een oordeel, de pagina en het citaat. Twijfelt Krito, dan staat er: kijk zelf na.",
    from: (
      <div className="frag frag-goal">
        <span className="frag-box" />
        <span>
          <b>GL3.18</b> De aarde heeft een magnetisch veld.
        </span>
      </div>
    ),
    to: (
      <div className="frag frag-goal is-marked">
        <StatusIcon status="partial" size={20} />
        <span>
          <b>Gedeeltelijk gedekt</b> Les magnetisme, pagina 6
        </span>
      </div>
    ),
  },
];

export function StepPairs() {
  return (
    <ol className="step-list">
      {steps.map((s, i) => (
        <li key={s.title}>
          <div className="step-pair" aria-hidden="true">
            {s.from}
            <Link />
            {s.to}
          </div>
          <h3>
            <span className="step-n">{i + 1}</span>
            {s.title}
          </h3>
          <p>{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
